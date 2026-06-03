/**
 * Tracking de ejecuciones de cron — sin migración Prisma.
 *
 * Almacena últimas 20 ejecuciones por cron en AdminSetting:
 *   key: `cron_runs_${name}`
 *   value: CronRun[]   (más nuevo primero, capped a 20)
 *
 * Helper wrapCronHandler(name, fn) decora un handler Next.js de cron:
 *   - mide elapsedMs
 *   - captura error si lanza
 *   - persiste el run en AdminSetting (fire-and-forget)
 *   - re-lanza el error para que Next devuelva 500
 *
 * Útil para detectar "el cron de auto-resolve lleva 3 días sin
 * ejecutarse" o "el de ai-usage-alert falla con TimeoutError".
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type CronRun = {
  at: string; // ISO timestamp del inicio
  elapsedMs: number;
  ok: boolean;
  status: number;
  error?: string; // mensaje truncado a 300 chars si falla
};

const MAX_RUNS_PER_CRON = 20;

export async function recordCronRun(name: string, run: CronRun): Promise<void> {
  try {
    const key = `cron_runs_${name}`;
    const row = await prisma.adminSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const list: CronRun[] = Array.isArray(row?.value)
      ? (row.value as unknown as CronRun[])
      : [];
    list.unshift(run);
    const capped = list.slice(0, MAX_RUNS_PER_CRON);
    await prisma.adminSetting.upsert({
      where: { key },
      create: { key, value: capped as unknown as object },
      update: { value: capped as unknown as object },
    });
  } catch (e) {
    // Si falla, no rompemos el cron — solo log
    console.error("[cron-tracking] failed to persist run:", e);
  }
}

export async function getCronHistory(name: string): Promise<CronRun[]> {
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: `cron_runs_${name}` },
      select: { value: true },
    });
    if (!row || !Array.isArray(row.value)) return [];
    return row.value as unknown as CronRun[];
  } catch {
    return [];
  }
}

/**
 * Lista los nombres de crons que han registrado al menos 1 run.
 * Lee AdminSetting keys con prefix `cron_runs_*`.
 */
export async function listCronNames(): Promise<string[]> {
  try {
    const rows = await prisma.adminSetting.findMany({
      where: { key: { startsWith: "cron_runs_" } },
      select: { key: true },
    });
    return rows
      .map((r) => r.key.replace(/^cron_runs_/, ""))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Decora un handler Next.js de cron. Uso:
 *
 *   export const POST = wrapCronHandler("ai-usage-alert", async (req) => {
 *     // ... lógica del cron
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * El wrapper:
 *  - Mide tiempo
 *  - Captura excepciones, persiste el run con ok=false
 *  - Re-lanza para que Next.js devuelva 500
 *  - Mira el status de la response si no lanza
 */
export function wrapCronHandler(
  name: string,
  handler: (req: Request) => Promise<NextResponse>,
): (req: Request) => Promise<NextResponse> {
  return async (req: Request) => {
    const startedAt = new Date();
    const startMs = Date.now();
    let res: NextResponse | null = null;
    let thrownError: unknown = null;
    try {
      res = await handler(req);
      return res;
    } catch (err) {
      thrownError = err;
      throw err;
    } finally {
      const elapsedMs = Date.now() - startMs;
      const status = res?.status ?? 500;
      const ok = !thrownError && status >= 200 && status < 300;
      void recordCronRun(name, {
        at: startedAt.toISOString(),
        elapsedMs,
        ok,
        status,
        error: thrownError
          ? thrownError instanceof Error
            ? thrownError.message.slice(0, 300)
            : String(thrownError).slice(0, 300)
          : undefined,
      });
    }
  };
}
