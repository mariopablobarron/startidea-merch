import { Prisma, type SupplierCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
