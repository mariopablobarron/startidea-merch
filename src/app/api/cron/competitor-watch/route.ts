import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { runCompetitorWatch } from "@/lib/competitor-intel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // ~8 productos × 3 competidores con pacing

/**
 * Vigilancia semanal de competencia — 🔒 interno.
 *
 *   POST /api/cron/competitor-watch   X-Cron-Secret → dispara (fire-and-forget)
 *
 * Analiza la watchlist (AdminSetting competitor_watchlist + top cotizados),
 * compara PVP+marcaje contra competidores y manda a Telegram solo lo
 * accionable (SUBIR/BAJAR con objetivo). Resultado en competitor_watch_last.
 */
export const POST = wrapCronHandler("competitor-watch", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Fire-and-forget: el análisis tarda minutos; el digest llega por Telegram.
  void runCompetitorWatch().catch((e) => {
    console.error("[competitor-watch] fallo async:", e instanceof Error ? e.message : e);
  });

  return NextResponse.json(
    { ok: true, status: "queued", message: "Análisis lanzado; el resumen llega por Telegram." },
    { status: 202 },
  );
});
