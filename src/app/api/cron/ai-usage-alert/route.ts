/**
 * POST /api/cron/ai-usage-alert
 *
 * Computa coste IA del día previo. Si supera umbral, notifyAdmins.
 *
 * Programado: diario 10:00 UTC (11:00 Madrid invierno, 12:00 verano).
 * Después del digest weekly del lunes para no saturar.
 *
 * Umbral:
 *   1. AdminSetting `ai_usage_alert_threshold_eur` (puede cambiarse desde UI)
 *   2. env AI_USAGE_ALERT_THRESHOLD_EUR
 *   3. Default: 5 €/día (≈ $5.4 ≈ 30K tokens Opus output o 100K Sonnet)
 *
 * Anti-spam: solo alerta si día anterior pasó umbral Y el día -2 no pasó.
 * Si lleva varios días seguidos altos, alerta solo el primero.
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";
import { estimateCostEur } from "@/lib/insights/ai-usage";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_THRESHOLD_EUR = 5;

async function getThresholdEur(): Promise<number> {
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: "ai_usage_alert_threshold_eur" },
      select: { value: true },
    });
    if (typeof row?.value === "number" && row.value > 0) return row.value;
  } catch {
    // ignore — usa env / default
  }
  const fromEnv = process.env.AI_USAGE_ALERT_THRESHOLD_EUR;
  if (fromEnv) {
    const n = parseFloat(fromEnv);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_THRESHOLD_EUR;
}

/** Coste IA en EUR para un rango [from, to). */
async function getCostForRange(from: Date, to: Date): Promise<number> {
  const rows = await prisma.recommenderQuery.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: {
      modelUsed: true,
      promptTokens: true,
      completionTokens: true,
    },
  });
  let total = 0;
  for (const r of rows) {
    total += estimateCostEur(
      r.modelUsed,
      r.promptTokens ?? 0,
      r.completionTokens ?? 0,
    );
  }
  return total;
}

export const POST = wrapCronHandler("ai-usage-alert", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const now = new Date();
  // Ayer 00:00 → hoy 00:00 (UTC)
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const dayBeforeStart = new Date(yesterdayStart.getTime() - 86_400_000);

  const [thresholdEur, yesterdayCost, dayBeforeCost] = await Promise.all([
    getThresholdEur(),
    getCostForRange(yesterdayStart, todayStart),
    getCostForRange(dayBeforeStart, yesterdayStart),
  ]);

  const exceeded = yesterdayCost > thresholdEur;
  const wasExceededYesterday = dayBeforeCost > thresholdEur;
  const shouldNotify = exceeded && !wasExceededYesterday;

  if (shouldNotify) {
    const dateLabel = yesterdayStart.toISOString().slice(0, 10);
    await notifyAdmins({
      title: `💸 Gasto IA alto · ${yesterdayCost.toFixed(2)} €`,
      body: `${dateLabel} · superó el umbral de ${thresholdEur.toFixed(2)} €/día. Revisa el desglose por modelo en /admin/insights#ai-usage.`,
      url: "/admin/insights#ai-usage",
      tag: `ai-usage-alert-${dateLabel}`,
    });
  }

  return NextResponse.json({
    ok: true,
    range: {
      yesterday: yesterdayStart.toISOString().slice(0, 10),
      dayBefore: dayBeforeStart.toISOString().slice(0, 10),
    },
    thresholdEur,
    yesterdayCost: Math.round(yesterdayCost * 100) / 100,
    dayBeforeCost: Math.round(dayBeforeCost * 100) / 100,
    exceeded,
    wasExceededYesterday,
    notified: shouldNotify,
    note: shouldNotify
      ? "Alerta enviada"
      : !exceeded
        ? "No superó umbral, sin alerta"
        : "Ya estaba alto ayer, anti-spam (alerta solo el primer día)",
  });
});

// GET para debug manual (mismo handler, mismo secret check)
export const GET = POST;
