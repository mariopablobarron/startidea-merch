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
import { getCatalogHealth, getConversionFunnel, getSuggestions } from "@/lib/insights";
import { notifyAdmins } from "@/lib/notify-admin";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = wrapCronHandler("metric-snapshot", async (req: Request) => {
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

  // Anomaly check: evaluar sugerencias y notificar admin si hay critical
  // que NO se hayan notificado en 24h. Dedup vía AdminSetting key
  // "anomaly_last_notified_<suggestionId>".
  let anomalyPushes = 0;
  try {
    const suggestions = await getSuggestions();
    const criticals = suggestions.filter((s) => s.severity === "critical");
    for (const c of criticals) {
      const key = `anomaly_last_notified_${c.id}`;
      const last = await prisma.adminSetting.findUnique({
        where: { key },
        select: { value: true },
      });
      const lastTs = typeof last?.value === "number" ? last.value : 0;
      if (Date.now() - lastTs < 24 * 3600_000) continue;
      await notifyAdmins({
        title: `🚨 ${c.title}`,
        body: c.body.slice(0, 200),
        url: c.action?.href ?? "/admin/insights#sugerencias",
        tag: `anomaly-${c.id}`,
      });
      await prisma.adminSetting.upsert({
        where: { key },
        create: { key, value: Date.now() },
        update: { value: Date.now() },
      });
      anomalyPushes++;
    }
  } catch (e) {
    console.error("[snapshot] anomaly check failed:", e);
  }

  return NextResponse.json({
    ok: true,
    snapshot_date: today.toISOString(),
    cleaned_old: cleaned.count,
    anomaly_pushes_sent: anomalyPushes,
  });
});
