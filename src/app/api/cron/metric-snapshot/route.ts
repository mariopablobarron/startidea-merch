/**
 * POST /api/cron/metric-snapshot
 *
 * Captura snapshot diario de KPIs en MetricSnapshot. Programado
 * 03:35 UTC (después del rollup).
 *
 * También limpia snapshots >180 días para mantener la tabla pequeña.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCatalogHealth, getConversionFunnel } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [health, funnel] = await Promise.all([
    getCatalogHealth(),
    getConversionFunnel(),
  ]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.metricSnapshot.upsert({
    where: { date: today },
    create: {
      date: today,
      views30d: funnel.views30d,
      cartAdds30d: funnel.cartAdds30d,
      recommenderQueries30d: funnel.recommenderQueries30d,
      proposals30d: funnel.proposals30d,
      activeProducts: health.activeProducts,
      variantsWithStock: health.variantsWithStock,
      cartConvPct: funnel.cartConvPct,
      proposalConvPct: funnel.proposalConvPct,
    },
    update: {
      views30d: funnel.views30d,
      cartAdds30d: funnel.cartAdds30d,
      recommenderQueries30d: funnel.recommenderQueries30d,
      proposals30d: funnel.proposals30d,
      activeProducts: health.activeProducts,
      variantsWithStock: health.variantsWithStock,
      cartConvPct: funnel.cartConvPct,
      proposalConvPct: funnel.proposalConvPct,
    },
  });

  // Limpieza >180d
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 180);
  const cleaned = await prisma.metricSnapshot.deleteMany({
    where: { date: { lt: cutoff } },
  });

  return NextResponse.json({
    ok: true,
    snapshot_date: today.toISOString(),
    cleaned_old: cleaned.count,
  });
}
