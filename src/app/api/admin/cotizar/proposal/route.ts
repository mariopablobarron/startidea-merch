import { NextResponse } from "next/server";
import { z } from "zod";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { computeCotizacion, type CotizarInput } from "@/lib/cotizar-core";
import { computeProposalTotals, type ProposalQuoteItem } from "@/lib/proposal-types";
import { generateProposalNumber } from "@/lib/proposal-number";
import { RecommenderProposalPdf } from "@/lib/recommender-proposal-pdf";
import { sendProposalEmail } from "@/lib/proposal-mailer";
import { signProposalToken } from "@/lib/proposal-token";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

/**
 * POST /api/admin/cotizar/proposal
 *
 * Convierte una cotización del cotizador rápido en una PROPUESTA FORMAL:
 * numerada (PROP-YYYY-NNNN), guardada en BD, con PDF de marca y opcionalmente
 * enviada por email al cliente. Reusa lib/cotizar-core (misma matemática que
 * /api/admin/cotizar) y el sistema de Propuestas del recomendador.
 *
 * El cliente NUNCA ve proveedor/coste: la línea usa publicRef (STM-XXX) y el
 * PVP final. El envío va incluido en el precio (portes en el coste → margen),
 * coherente con la condición "Envío peninsular incluido" del PDF.
 */
const Schema = z.object({
  // Parámetros de la cotización (idénticos a /api/admin/cotizar)
  ref: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(100_000),
  techniqueCode: z.string().min(1).max(20).optional(),
  marginPct: z.number().min(0).max(900).optional(),
  numberOfColours: z.number().int().min(1).max(12).optional(),
  printAreaCm2: z.number().min(0).max(100_000).optional(),
  manipulationCode: z.string().min(1).max(2).optional(),
  portesCents: z.number().int().min(0).max(1_000_000).optional(),
  couponCode: z.string().min(1).max(40).optional(),
  // Datos del cliente / propuesta
  email: z.string().email().max(200),
  name: z.string().max(120).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  send: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const d = parsed.data;

  // 1) Recalcular la cotización en el servidor (fuente de verdad del dinero)
  const quoteInput: CotizarInput = {
    ref: d.ref,
    qty: d.qty,
    techniqueCode: d.techniqueCode,
    marginPct: d.marginPct,
    numberOfColours: d.numberOfColours,
    printAreaCm2: d.printAreaCm2,
    manipulationCode: d.manipulationCode,
    portesCents: d.portesCents,
    couponCode: d.couponCode,
  };
  const quote = await computeCotizacion(quoteInput);
  if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: quote.status });
  if (quote.pvp.baseTotal <= 0) {
    return NextResponse.json(
      { error: "El producto no tiene precio válido para cotizar. Revisa la tarifa o el coste." },
      { status: 400 },
    );
  }

  // 2) Construir UNA línea de propuesta todo-incluido (sin exponer proveedor)
  //    Precio unitario = PVP base ÷ cantidad (incluye marcaje y envío). El
  //    desglose interno coste/proveedor NO va al cliente.
  const item: ProposalQuoteItem = {
    description: quote.product.name,
    notFound: false,
    quantity: quote.qty,
    sizes: null,
    technique: quote.marking?.techniqueLabel ?? null,
    colorRequested: null,
    product: {
      slug: quote.product.slug,
      name: quote.product.name,
      ref: quote.product.publicRef, // STM-XXX / slug — NUNCA supplierRef
      url: `${SITE_URL}/catalogo/${quote.product.slug}`,
      primaryImageUrl: quote.product.imageUrl,
    },
    unitPriceCents: Math.round(quote.pvp.baseTotal / quote.qty),
    markingPerUnitCents: 0,
    markingSetupCents: 0,
    totalCents: quote.pvp.baseTotal,
    priceSource: quote.product.hasRealPricing ? "tier" : "estimate",
  };
  const items = [item];
  const totals = computeProposalTotals(items);

  // 3) Numeración + PDF + persistencia (patrón de /api/proposal/send)
  let proposalNumber: string;
  try {
    proposalNumber = await generateProposalNumber();
  } catch {
    return NextResponse.json({ error: "No se pudo generar el número de propuesta." }, { status: 500 });
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      createElement(RecommenderProposalPdf, {
        proposalNumber,
        date: new Date(),
        email: d.email,
        name: d.name ?? null,
        company: d.company ?? null,
        items,
        totals,
      }) as unknown as ReactElement<DocumentProps>,
    );
  } catch {
    return NextResponse.json({ error: "No se pudo generar el PDF de la propuesta." }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  let proposalId: string;
  try {
    const created = await prisma.proposal.create({
      data: {
        proposalNumber,
        email: d.email,
        name: d.name ?? null,
        company: d.company ?? null,
        quoteItems: items as unknown as Prisma.InputJsonValue,
        subtotalCents: totals.subtotalCents,
        ivaCents: totals.ivaCents,
        totalCents: totals.totalCents,
        recommenderQueryId: null,
        ip,
        ua,
      },
      select: { id: true },
    });
    proposalId = created.id;
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la propuesta." }, { status: 500 });
  }

  const token = signProposalToken(proposalId);
  const downloadUrl = `${SITE_URL}/api/proposal/${encodeURIComponent(proposalNumber)}/pdf?token=${encodeURIComponent(token)}`;

  // 4) Envío opcional al cliente (transaccional → RESEND_FROM pedidos@startidea.es)
  let emailed = false;
  let emailError: string | undefined;
  if (d.send) {
    const sent = await sendProposalEmail({
      proposalNumber,
      toEmail: d.email,
      name: d.name ?? null,
      totals,
      downloadUrl,
      pdfBuffer,
    });
    if (sent.ok) {
      emailed = true;
      await prisma.proposal.update({ where: { id: proposalId }, data: { resendId: sent.id } }).catch(() => {});
    } else {
      emailError = sent.error;
    }
  }

  void notifyTelegram(
    `📄 <b>Propuesta ${proposalNumber}</b> creada desde el cotizador\n` +
      `Cliente: ${d.name || d.company || d.email}\n` +
      `Total: ${(totals.totalCents / 100).toFixed(2)} € (IVA inc.)\n` +
      `${d.send ? (emailed ? "✉️ Enviada por email" : "⚠️ Email FALLÓ — guardada igualmente") : "💾 Guardada sin enviar"}`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    proposalNumber,
    downloadUrl,
    emailed,
    ...(emailError ? { emailError } : {}),
  });
}
