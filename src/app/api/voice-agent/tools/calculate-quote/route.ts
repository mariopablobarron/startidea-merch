import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

const Schema = z.object({
  slug: z.string().min(1).max(160),
  quantity: z.number().int().positive().max(1_000_000),
  technique_code: z.string().max(20).optional(),       // ej. "S1" serigrafía, "L1" láser
  number_of_colors: z.number().int().min(1).max(10).optional().default(1),
  marking_position_id: z.string().max(40).optional(),  // ej. "FRONT DO DL"
});

/**
 * Tool: calculate_quote
 * Calcula precio cliente (margen aplicado) sin persistir. Wrapper sobre
 * /api/quote/calculate para reutilizar la lógica única.
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Reutilizamos el endpoint público existente
  const internalRes = await fetch(`${SITE_URL}/api/quote/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productSlug: d.slug,
      quantity: d.quantity,
      techniqueCode: d.technique_code,
      numberOfColours: d.number_of_colors,
      positionCount: d.marking_position_id ? 1 : undefined,
    }),
  });

  if (!internalRes.ok) {
    const errText = (await internalRes.text()).slice(0, 200);
    return NextResponse.json(
      { error: `Error interno calculando precio (HTTP ${internalRes.status})`, detail: errText },
      { status: 502 },
    );
  }

  const json = await internalRes.json();
  // El endpoint devuelve Money como {cents, formatted} — NUNCA .value. Leer
  // .value aquí dejaba unit/total a null y TODAS las cotizaciones de David
  // caían al fallback "presupuesto formal en 24h" (bug cazado en E2E 2026-07-28).
  const unitCents = json.clientUnitPrice?.cents ?? json.unitClientCents ?? null;
  const totalCents = json.clientTotal?.cents ?? json.totalClientCents ?? null;
  const markingPerUnitCents = json.clientMarkingPerUnit?.cents ?? null;
  const unit = unitCents != null ? unitCents / 100 : null;
  const total = totalCents != null ? totalCents / 100 : null;

  // Optimizamos respuesta para que Carmen la lea fácilmente. Si no hay precio
  // (producto sin tier configurado), devolvemos mensaje claro que Carmen puede
  // narrar al usuario en vez de quedarse en silencio.
  if (unit == null && total == null) {
    return NextResponse.json({
      product_slug: d.slug,
      quantity: d.quantity,
      unit_price_eur: null,
      total_eur: null,
      no_price_available: true,
      notes:
        "Este producto aún no tiene precio orientativo automático. Ofrécele al usuario crear una cotización formal con submit_quote para que el equipo le pase precio cerrado en menos de 24h laborables.",
    });
  }

  return NextResponse.json({
    product_slug: d.slug,
    quantity: d.quantity,
    unit_price_eur: unit,
    marking_unit_price_eur: markingPerUnitCents != null ? markingPerUnitCents / 100 : null,
    total_eur: total,
    valid_for_days: 30,
    notes:
      "Precio orientativo. Cotización cerrada se confirma en menos de 24h con mockup técnico incluido.",
  });
}
