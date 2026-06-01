/**
 * Tool Carmen: top_this_week
 *
 * Cuando el cliente del admin (Mario) consulta cosas como:
 *   - "qué se vendió esta semana"
 *   - "cómo va el negocio"
 *   - "dame el resumen rápido"
 *
 * Solo accesible con cron secret (admin only — no es para cliente final
 * sino para el agente personalizado en el admin/voz futura).
 *
 * Devuelve número simple + frase humana.
 */
import { NextResponse } from "next/server";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { getConversionFunnel, getSuggestions } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [funnel, suggestions] = await Promise.all([
    getConversionFunnel(),
    getSuggestions(),
  ]);

  const criticas = suggestions.filter((s) => s.severity === "critical").length;

  let summary =
    `En los últimos 30 días llevamos ${funnel.proposals30d} propuestas enviadas, ` +
    `${funnel.cartAdds30d} añadidos al carrito y ${funnel.views30d.toLocaleString("es-ES")} visitas al catálogo. `;

  if (funnel.proposals30dDelta > 0) {
    summary += `Las propuestas crecen un ${Math.abs(funnel.proposals30dDelta).toFixed(0)} por ciento respecto al mes anterior. `;
  } else if (funnel.proposals30dDelta < -5) {
    summary += `Las propuestas bajan un ${Math.abs(funnel.proposals30dDelta).toFixed(0)} por ciento. `;
  }

  if (criticas > 0) {
    summary += `Hay ${criticas} ${criticas === 1 ? "alerta crítica" : "alertas críticas"} que conviene revisar en el panel insights. `;
  }

  return NextResponse.json({
    ok: true,
    metrics: {
      views_30d: funnel.views30d,
      cart_adds_30d: funnel.cartAdds30d,
      recommender_30d: funnel.recommenderQueries30d,
      proposals_30d: funnel.proposals30d,
      view_to_cart_pct: funnel.cartConvPct,
      cart_to_proposal_pct: funnel.proposalConvPct,
      proposals_delta_pct: funnel.proposals30dDelta,
    },
    suggestions_count: suggestions.length,
    critical_count: criticas,
    summary,
    tts_hint:
      "Lee el resumen tal cual. Si Mario pregunta por detalles, llama a popular_products o list_promotions.",
  });
}
