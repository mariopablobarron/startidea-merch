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
 *   }
 *
 * Respuesta:
 *   200 { proposalNumber, downloadUrl }
 *   400 { error }  — validación
 *   429 { error }  — rate limit
 *   500 { error }  — fallo al enviar email o persistir
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
    void notifyTelegram(
      `⚠️ <b>Propuesta PDF render FALLÓ</b>\n` +
        `Propuesta: ${proposalNumber}\n` +
        `To: ${parsed.email}\n` +
        `Error: ${escapeTgHtml(message.slice(0, 300))}`,
    ).catch((e) =>
      console.error("[proposal-send] notifyTelegram (aviso PDF fallido) falló:", e instanceof Error ? e.message : e),
    );
    return NextResponse.json(
      { error: "PDF_RENDER_FAILED", detail: message },
      { status: 500 },
    );
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
