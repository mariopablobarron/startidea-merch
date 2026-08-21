/**
 * Detección de syncs de proveedor que ARRANCAN Y NO CIERRAN.
 *
 * `SupplierSync` guarda una fila por proveedor: se crea (o se pisa) con
 * `finishedAt = null, ok = false` al empezar, y se cierra al final con el
 * resultado. Si el proceso muere a mitad, esa fila se queda abierta para
 * siempre y **nadie se entera**:
 *
 * - el `merch-cron-runner.sh` del VPS reporta `OK · HTTP 200` porque el
 *   endpoint contesta **202 en 0,1 s** (fire-and-forget) y no espera al sync;
 * - el histórico `SupplierSyncRun` es append-only *al terminar*, así que de una
 *   ejecución muerta no queda ni rastro;
 * - el `cron-watchdog` vigila **silencio** de crons, y el cron sí se ejecutó.
 *
 * Medido el 2026-08-21: el sync de makito arrancó a las 04:00, actualizó los
 * 4.479 productos y 8.486 variantes de stock, y murió hacia las 04:13 — a unos
 * dos minutos de terminar, justo antes de refrescar el «Desde X€». Doce horas
 * después su fila seguía abierta con `ok = false`, sin fila en el histórico, y
 * el único sitio donde constaba el fallo era esa columna que no mira nadie.
 *
 * El umbral por defecto son 2 h: la ejecución más larga observada (makito) es
 * de ~14 min (840 s), así que deja 8× de margen antes de llamar "colgado" a
 * algo que solo va lento.
 */

/** Lo que hace falta de una fila de `SupplierSync` para juzgarla. */
export type SupplierSyncSnapshot = {
  supplier: string;
  startedAt: Date;
  finishedAt: Date | null;
};

export type StalledSync = {
  supplier: string;
  startedAt: string;
  /** Horas que lleva abierta la ejecución, redondeadas a un decimal. */
  hoursRunning: number;
};

export const STALLED_AFTER_HOURS = 2;

/**
 * Devuelve los syncs que llevan abiertos más de `afterHours`, de más antiguo a
 * más reciente (el que más lleva colgado es el más grave).
 *
 * Una ejecución recién arrancada NO es un problema: sin margen, este detector
 * cantaría cada madrugada mientras los syncs corren de verdad.
 */
export function detectStalledSyncs(
  snapshots: SupplierSyncSnapshot[],
  nowMs: number,
  afterHours: number = STALLED_AFTER_HOURS,
): StalledSync[] {
  const stalled: StalledSync[] = [];
  for (const s of snapshots) {
    if (s.finishedAt !== null) continue;
    const startedMs = s.startedAt.getTime();
    // Una fecha ilegible (o futura) no se convierte en aviso: sin dato fiable
    // preferimos callar a inventar un colgado que nadie puede cerrar.
    if (!Number.isFinite(startedMs)) continue;
    const hours = (nowMs - startedMs) / 3_600_000;
    if (hours <= afterHours) continue;
    stalled.push({
      supplier: s.supplier,
      startedAt: s.startedAt.toISOString(),
      hoursRunning: Math.round(hours * 10) / 10,
    });
  }
  return stalled.sort((a, b) => b.hoursRunning - a.hoursRunning);
}

/** Nombre con el que un sync colgado entra en la lista de problemas del watchdog. */
export function stalledIssueName(supplier: string): string {
  return `sync:${supplier}`;
}
