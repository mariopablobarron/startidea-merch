/**
 * POST /api/proposal/send
 *
 * Genera una propuesta (PROP-YYYY-NNNN), renderiza el PDF, lo envía
 * por email al cliente y lo persiste en BD.
 *
 * Cuerpo esperado:
 *   {
 *     email: string;             // required
 *     name?: string;             // opcional
 *     company?: string;          // opcional
 *     quoteItems: ProposalQuoteItem[];  // del recomendador
 *     recommenderQueryId?: string;      // si viene de un query previo
 *     dryRun?: boolean;          // ENSAYO: ver abajo. Solo admin.
 *   }
 *
 * Respuesta:
 *   200 { proposalNumber, downloadUrl }
 *   400 { error }  — validación
 *   401 { error }  — dryRun sin credencial de admin
 *   429 { error }  — rate limit
 *   500 { error }  — fallo al enviar email o persistir
 *
 * MODO ENSAYO (`dryRun: true`)
 * ---------------------------
 * Esta ruta no se podía probar de punta a punta contra producción sin causar
 * tres efectos reales: un email a una persona, una fila `Proposal` en la BD y
 * un aviso a los admins por Telegram. El ensayo recorre el mismo camino —
 * validación, saneado, cálculo de totales y render real del PDF, que es donde
 * se rompen las cosas — y corta justo antes de cualquier efecto externo:
 *
 *   NO crea la fila `Proposal`      NO envía el email      NO avisa a Telegram
 *   NO avisa a los admins           NO toca `ProductView`
 *
 * Va detrás de credencial de admin (cookie de sesión o `X-Admin-Secret`) a
 * propósito: sin ese cerrojo sería una vía anónima para hacer renderizar PDFs
 * al servidor SIN dejar rastro en la BD — hoy toda petición que llega hasta el
 * render deja su fila. El ensayo quita el rastro, así que tiene que quitar
 * también el anonimato.
 *
 * El `proposalNumber` que devuelve es el que le tocaría a la siguiente
 * propuesta real, y NO queda reservado: no se persiste nada, así que la
 * siguiente propuesta de verdad usará ese mismo número.
 */
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  computeProposalTotals,
  type ProposalQuoteItem,
} from "@/lib/proposal-types";
import { generateProposalNumber } from "@/lib/proposal-number";
import { signProposalToken } from "@/lib/proposal-token";
import { RecommenderProposalPdf } from "@/lib/recommender-proposal-pdf";
import { sendProposalEmail } from "@/lib/proposal-mailer";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { notifyAdmins } from "@/lib/notify-admin";
import { isNotificationEnabled } from "@/lib/notification-rules";
import type { Prisma } from "@prisma/client";
import { BodySchema } from "@/lib/proposal-send-schema";
import { requireAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

export async function POST(req: Request) {
  // Rate limit: 5 propuestas por 10 min por IP — generoso para humano,
  // duro para abuso.
  const rl = rateLimit(req, {
    key: "proposal-send",
    max: 5,
    windowMs: 10 * 60_000,
  });
  if (!rl.ok) return rl.response;

  let parsed;
  try {
    const json = await req.json();
    parsed = BodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  // El ensayo no deja rastro en BD, así que no puede ser anónimo (ver cabecera).
  const dryRun = parsed.dryRun === true;
  if (dryRun) {
    const auth = await requireAdminSession(req);
    if (!auth.ok) {
      return NextResponse.json(
        { error: "DRY_RUN_REQUIERE_ADMIN", detail: auth.reason },
        { status: auth.status },
      );
    }
  }

  const items: ProposalQuoteItem[] = parsed.quoteItems;
  const totals = computeProposalTotals(items);

  // Si subtotal == 0 (todos notFound o sin precio), no tiene sentido enviar.
  if (totals.subtotalCents <= 0) {
    return NextResponse.json(
      { error: "NO_PRICED_ITEMS" },
      { status: 400 },
    );
  }

  // IP + UA para auditoría
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const ua = req.headers.get("user-agent");

  // 1. Generar número
  let proposalNumber: string;
  try {
    proposalNumber = await generateProposalNumber();
  } catch (err) {
    return NextResponse.json(
      {
        error: "NUMBER_GEN_FAILED",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const now = new Date();

  // 2. Renderizar PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      createElement(RecommenderProposalPdf, {
        proposalNumber,
        date: now,
        email: parsed.email,
        name: parsed.name ?? null,
        company: parsed.company ?? null,
        items,
        totals,
      }) as unknown as ReactElement<DocumentProps>,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // En ensayo el fallo se devuelve a quien lo pidió y no despierta a nadie.
    if (!dryRun) void notifyTelegram(
      `⚠️ <b>Propuesta PDF render FALLÓ</b>\n` +
        `Propuesta: ${proposalNumber}\n` +
        `To: ${parsed.email}\n` +
        `Error: ${escapeTgHtml(message.slice(0, 300))}`,
    ).catch((e) =>
      console.error("[proposal-send] notifyTelegram (aviso PDF fallido) falló:", e instanceof Error ? e.message : e),
    );
    return NextResponse.json(
      { error: "PDF_RENDER_FAILED", detail: message, ...(dryRun ? { dryRun: true } : {}) },
      { status: 500 },
    );
  }

  // 2b. Fin del ensayo: el PDF se ha renderizado de verdad, y aquí empiezan
  // los efectos externos. Ni una línea más.
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      proposalNumber,
      numeroReservado: false,
      pdfBytes: pdfBuffer.length,
      wouldSendTo: parsed.email,
      totals,
      items: items.length,
      skipped: [
        "Proposal.create",
        "sendProposalEmail",
        "notifyTelegram",
        "notifyAdmins",
        "ProductView.upsert",
      ],
    });
  }

  // 3. Persistir en BD antes de enviar email (necesitamos id para el token)
  let proposalId: string;
  try {
    const created = await prisma.proposal.create({
      data: {
        proposalNumber,
        email: parsed.email,
        name: parsed.name ?? null,
        company: parsed.company ?? null,
        quoteItems: items as unknown as Prisma.InputJsonValue,
        subtotalCents: totals.subtotalCents,
        ivaCents: totals.ivaCents,
        totalCents: totals.totalCents,
        recommenderQueryId: parsed.recommenderQueryId ?? null,
        ip,
        ua,
      },
      select: { id: true },
    });
    proposalId = created.id;
  } catch (err) {
    return NextResponse.json(
      {
        error: "PERSIST_FAILED",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // 4. Generar URL firmada
  const token = signProposalToken(proposalId);
  const downloadUrl = `${SITE_URL}/api/proposal/${encodeURIComponent(proposalNumber)}/pdf?token=${encodeURIComponent(token)}`;

  // 5. Enviar email con PDF adjunto
  const emailResult = await sendProposalEmail({
    proposalNumber,
    toEmail: parsed.email,
    name: parsed.name ?? null,
    totals,
    downloadUrl,
    pdfBuffer,
  });

  if (!emailResult.ok) {
    // Email falló pero la propuesta SÍ está persistida. Devolvemos OK
    // con flag emailFailed para que el cliente pueda descargar manualmente.
    return NextResponse.json({
      ok: true,
      proposalNumber,
      downloadUrl,
      emailFailed: true,
      emailError: emailResult.error,
    });
  }

  // 6. Guardar resendId para tracking futuro
  try {
    await prisma.proposal.update({
      where: { id: proposalId },
      data: { resendId: emailResult.id },
    });
  } catch (e) {
    // No crítico, seguimos
    console.error("[proposal-send] guardar resendId falló:", e instanceof Error ? e.message : e);
  }

  // 6b. Bump proposalCount + lastCartAddAt en ProductView por cada item
  // que tenga producto identificado (notFound se ignoran).
  void (async () => {
    try {
      const slugs = items
        .filter((it) => !it.notFound && it.product?.slug)
        .map((it) => it.product!.slug);
      if (slugs.length === 0) return;
      const prods = await prisma.product.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true },
      });
      await Promise.all(
        prods.map((p) =>
          prisma.productView.upsert({
            where: { productId: p.id },
            update: {
              proposalCount: { increment: 1 },
              cartAdd30d: { increment: 1 },
            },
            create: {
              productId: p.id,
              proposalCount: 1,
              cartAdd30d: 1,
            },
          }),
        ),
      );
    } catch (e) {
      console.error("[proposal] track productView failed:", e);
    }
  })();

  // 7. Notificar a admin (Telegram + push browser)
  const summary =
    `Nº: ${proposalNumber}\n` +
    `A: ${parsed.email}` +
    (parsed.name ? ` (${escapeTgHtml(parsed.name)})` : "") +
    (parsed.company ? ` · ${escapeTgHtml(parsed.company)}` : "") +
    `\n` +
    `Total: ${(totals.totalCents / 100).toFixed(2)}€ (IVA incl.)\n` +
    `Items: ${items.length}`;
  void notifyTelegram(`📨 <b>Propuesta enviada</b>\n${summary}`).catch((e) =>
    console.error("[proposal-send] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );
  void (async () => {
    if (await isNotificationEnabled("proposal_received")) {
      await notifyAdmins(
        {
          title: `📨 Propuesta ${proposalNumber} enviada`,
          body: `${parsed.email} · ${(totals.totalCents / 100).toFixed(2)}€ · ${items.length} items`,
          url: "/admin/propuestas",
          tag: `proposal-${proposalNumber}`,
        },
        { event: "proposal_received" },
      );
    }
  })().catch((e) =>
    console.error("[proposal-send] notifyAdmins falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({
    ok: true,
    proposalNumber,
    downloadUrl,
  });
}
