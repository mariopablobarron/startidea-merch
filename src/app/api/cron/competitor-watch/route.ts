import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { wrapCronHandler } from "@/lib/cron-tracking";
import {
  runCompetitorWatch,
  buildWatchlist,
  competitorSources,
  INTEL_VERSION,
} from "@/lib/competitor-intel";

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

/** GET — estado del último run + últimas observaciones (mismo secret). */
export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [last, total, rows, watchlistPreview, sources] = await Promise.all([
    prisma.adminSetting.findUnique({ where: { key: "competitor_watch_last" } }),
    prisma.competitorPrice.count(),
    prisma.competitorPrice.findMany({
      orderBy: { fetchedAt: "desc" },
      take: 10,
      include: { product: { select: { internalRef: true, name: true } } },
    }),
    buildWatchlist(8),
    competitorSources(),
  ]);
  return NextResponse.json({
    ok: true,
    version: INTEL_VERSION,
    tavily: Boolean(process.env.TAVILY_API_KEY),
    sources,
    watchlistPreview,
    lastRun: last?.value ?? null,
    totalObservaciones: total,
    ultimas: rows.map((r) => ({
      producto: r.product.name,
      ref: r.product.internalRef,
      competidor: r.competitor,
      qty: r.qty,
      unit: (r.unitPriceCents / 100).toFixed(2),
      conMarcaje: r.includesMarking,
      confianza: r.matchConfidence,
      url: r.url,
      fecha: r.fetchedAt,
    })),
  });
}
