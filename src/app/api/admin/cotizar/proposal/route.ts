import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { computeCotizacion, type CotizarInput } from "@/lib/cotizar-core";
import { createProposalFromCotizacion } from "@/lib/proposal-from-cotizacion";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cotizar/proposal
 *
 * Convierte una cotización del cotizador rápido en una PROPUESTA FORMAL numerada
 * (PROP-YYYY-NNNN), guardada con PDF de marca. Si `send: true` la envía al
 * cliente (status "sent"); si `send: false` la deja en BORRADOR ("draft") para
 * revisarla y enviarla luego con 1 clic desde /admin/propuestas.
 *
 * Reusa lib/cotizar-core (misma matemática que /api/admin/cotizar) y
 * lib/proposal-from-cotizacion (mismo puente que la solicitud pública).
 */
const Schema = z.object({
  ref: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(100_000),
  techniqueCode: z.string().min(1).max(20).optional(),
  marginPct: z.number().min(0).max(900).optional(),
  numberOfColours: z.number().int().min(1).max(12).optional(),
  printAreaCm2: z.number().min(0).max(100_000).optional(),
  manipulationCode: z.string().min(1).max(2).optional(),
  portesCents: z.number().int().min(0).max(1_000_000).optional(),
  couponCode: z.string().min(1).max(40).optional(),
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;

  const result = await createProposalFromCotizacion({
    quote,
    email: d.email,
    name: d.name ?? null,
    company: d.company ?? null,
    status: d.send ? "sent" : "draft",
    send: d.send,
    ip,
    ua,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  void notifyTelegram(
    `📄 <b>Propuesta ${result.proposalNumber}</b> creada desde el cotizador\n` +
      `Cliente: ${d.name || d.company || d.email}\n` +
      `Total: ${(quote.pvp.totalConIva / 100).toFixed(2)} € (IVA inc.)\n` +
      `${d.send ? (result.emailed ? "✉️ Enviada por email" : "⚠️ Email FALLÓ — guardada igualmente") : "💾 Borrador (revisar y enviar en /admin/propuestas)"}`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    proposalNumber: result.proposalNumber,
    downloadUrl: result.downloadUrl,
    emailed: result.emailed,
    ...(result.emailError ? { emailError: result.emailError } : {}),
  });
}
