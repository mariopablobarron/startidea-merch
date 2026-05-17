import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

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

  // Optimizamos respuesta para que Alma la lea fácilmente
  return NextResponse.json({
    product_slug: d.slug,
    quantity: d.quantity,
    unit_price_eur: json.clientUnitPrice ? json.clientUnitPrice.value : null,
    marking_unit_price_eur: json.clientMarkingPerUnit ? json.clientMarkingPerUnit.value : null,
    total_eur: json.clientTotal ? json.clientTotal.value : null,
    valid_for_days: 30,
    notes:
      "Precio orientativo. Cotización cerrada se confirma en menos de 24h con mockup técnico incluido.",
  });
}
