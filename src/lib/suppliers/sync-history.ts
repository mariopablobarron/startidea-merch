import { Prisma, type SupplierCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyTelegram } from "@/lib/telegram";

/**
 * Registra en el histórico append-only (`SupplierSyncRun`) una ejecución de
 * sync de proveedor. Es TELEMETRÍA: si falla, NO debe romper el sync (que ya
 * habrá actualizado su snapshot en SupplierSync). Por eso traga el error.
 */
export async function recordSupplierSyncRun(input: {
  supplier: SupplierCode;
  startedAt: Date;
  finishedAt: Date;
  ok: boolean;
  productsFetched: number;
  productsUpserted: number;
  errorsJson?: unknown;
}): Promise<void> {
  try {
    const hasErrors =
      input.errorsJson != null &&
      !(Array.isArray(input.errorsJson) && input.errorsJson.length === 0);
    await prisma.supplierSyncRun.create({
      data: {
        supplier: input.supplier,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        durationMs: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
        ok: input.ok,
        productsFetched: input.productsFetched,
        productsUpserted: input.productsUpserted,
        errorsJson: hasErrors
          ? (input.errorsJson as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
  } catch (e) {
    console.error("[supplier-sync-history] no se pudo registrar el run:", e);
  }
}

export type SupplierRunSample = { supplier: SupplierCode; durationMs: number };

export type SupplierTrend = {
  lastMs: number;
  medianMs: number;
  samples: number;
  /** Última ejecución claramente más lenta que su mediana histórica. */
  degraded: boolean;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Resume la tendencia de duración por proveedor a partir de runs recientes
 * (más nuevos primero). `degraded` = la última ejecución tarda ≥2× la mediana
 * de las últimas y hay al menos 3 muestras (para no marcar ruido con 1-2 datos).
 *
 * Función PURA: sin BD, testeable.
 */
export function summarizeSupplierRuns(
  runsNewestFirst: SupplierRunSample[],
): Record<string, SupplierTrend> {
  const bySupplier = new Map<SupplierCode, number[]>();
  for (const r of runsNewestFirst) {
    const arr = bySupplier.get(r.supplier) ?? [];
    arr.push(r.durationMs);
    bySupplier.set(r.supplier, arr);
  }
  const out: Record<string, SupplierTrend> = {};
  for (const [supplier, durations] of bySupplier) {
    const lastMs = durations[0] ?? 0;
    const med = median(durations);
    out[supplier] = {
      lastMs,
      medianMs: med,
      samples: durations.length,
      degraded: durations.length >= 3 && med > 0 && lastMs >= med * 2,
    };
  }
  return out;
}

/** Igual que la ventana del panel /admin/control (take: 40) → misma mediana. */
const DEGRADATION_WINDOW = 40;
const ALERT_KEY = (supplier: SupplierCode) => `supplier_sync_degraded_alert:${supplier}`;

/**
 * Decide qué alerta emitir comparando el estado ya avisado con el actual.
 * Solo avisa en la TRANSICIÓN (sano→degradado o degradado→sano), nunca en
 * cada sync, para no spamear. Función PURA: testeable sin BD ni Telegram.
 */
export function decideDegradationAlert(
  prevAlerted: boolean,
  nowDegraded: boolean,
): "degraded" | "recovered" | "none" {
  if (nowDegraded && !prevAlerted) return "degraded";
  if (!nowDegraded && prevAlerted) return "recovered";
  return "none";
}

function fmtSecs(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/**
 * Tras registrar un run, comprueba si el proveedor entró (o salió) de un estado
 * degradado y avisa por Telegram al equipo — SOLO en la transición. El estado
 * ya avisado se persiste en AdminSetting para deduplicar entre ejecuciones.
 *
 * Es TELEMETRÍA/aviso interno: si algo falla, NO rompe el sync (traga el error).
 * Reusa exactamente el mismo cálculo que la señal visual de /admin/control
 * (ventana de 40 runs → summarizeSupplierRuns), así panel y alerta coinciden.
 */
export async function checkAndAlertSupplierDegradation(
  supplier: SupplierCode,
): Promise<void> {
  try {
    const runs = await prisma.supplierSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: DEGRADATION_WINDOW,
      select: { supplier: true, durationMs: true },
    });
    const trend = summarizeSupplierRuns(runs)[supplier];
    // Sin trend o con <3 muestras (degraded=false) no hay base para avisar.
    if (!trend) return;
    const nowDegraded = trend.degraded;

    const key = ALERT_KEY(supplier);
    const row = await prisma.adminSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const prevAlerted = row?.value === true;

    const action = decideDegradationAlert(prevAlerted, nowDegraded);
    if (action === "none") return;

    if (action === "degraded") {
      const ratio = trend.medianMs > 0 ? trend.lastMs / trend.medianMs : 0;
      await notifyTelegram(
        `⚠️ <b>Sync degradado: ${supplier}</b>\n` +
          `La última ejecución tardó <b>${ratio.toFixed(1).replace(".", ",")}×</b> la mediana histórica.\n` +
          `Última: ${fmtSecs(trend.lastMs)} · mediana: ${fmtSecs(trend.medianMs)} · muestras: ${trend.samples}`,
      );
    } else {
      await notifyTelegram(
        `✅ <b>Sync recuperado: ${supplier}</b>\n` +
          `Última: ${fmtSecs(trend.lastMs)} · mediana: ${fmtSecs(trend.medianMs)}`,
      );
    }

    await prisma.adminSetting.upsert({
      where: { key },
      create: { key, value: nowDegraded },
      update: { value: nowDegraded },
    });
  } catch (e) {
    console.error("[supplier-sync-history] alerta de degradación falló:", e);
  }
}
