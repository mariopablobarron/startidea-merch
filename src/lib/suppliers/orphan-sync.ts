/**
 * Rescate de la ejecución ANTERIOR cuando el proceso murió sin cerrar su fila.
 *
 * `SupplierSync` guarda **una fila por proveedor** (`supplier @unique`): cada
 * arranque la pisa con `finishedAt = null`. `withSyncFailureClosing` la cierra
 * si el sync **lanza**, pero no si lo matan a mitad (contenedor recreado por un
 * deploy, OOM, `docker restart`): entonces la fila se queda abierta y, cuando
 * al día siguiente el sync vuelve a arrancar, el `upsert` de apertura la
 * **sobrescribe**. Con ella se va la única prueba de que hubo una ejecución
 * muerta — incluida la fase anotada en `notes`, que ese mismo `update` limpia.
 *
 * `SupplierSyncRun` es append-only y solo se escribe **al terminar**, así que
 * de una ejecución muerta no queda hoy ni una fila. `detectStalledSyncs` sí la
 * ve, pero solo mientras sigue abierta y con 2 h de retraso: si el sync muere
 * de madrugada y nadie mira el panel, el siguiente arranque borra la evidencia.
 *
 * Este módulo cierra ese hueco: **antes** de pisar la fila, si la anterior
 * quedó abierta, se registra en el histórico como ejecución fallida.
 */

import { STALLED_AFTER_HOURS } from "./stalled-sync";

/** Lo que hace falta de la fila previa para juzgarla. */
export type PreviousSyncRow = {
  startedAt: Date;
  finishedAt: Date | null;
  productsFetched: number;
  productsUpserted: number;
  /** Última fase anotada por `marcarFase()`, si la hubo. */
  notes: string | null;
};

/** Registro histórico que describe la ejecución muerta. */
export type OrphanedSyncRun = {
  startedAt: Date;
  finishedAt: Date;
  ok: false;
  productsFetched: number;
  productsUpserted: number;
  errorsJson: { ref: string; message: string }[];
};

/** Marca con la que una ejecución muerta se distingue de una que falló sola. */
export const ORPHAN_ERROR_REF = "_muerto";

/**
 * Decide si la fila previa quedó huérfana y, en tal caso, qué registrar.
 * Función PURA: sin BD, testeable.
 *
 * Devuelve `null` cuando NO hay nada que rescatar:
 * - la fila cerró (con éxito o con fallo): su run ya está en el histórico;
 * - la fila lleva abierta menos de `afterHours`: puede ser un sync **vivo**
 *   solapándose con este arranque, y dar por muerto lo que está corriendo
 *   sería inventar un fallo que no existe. Mismo umbral que
 *   `detectStalledSyncs` (2 h contra ~14 min de la ejecución más larga vista),
 *   para que el detector en caliente y este rescate en frío no se contradigan;
 * - la fecha de arranque es ilegible o futura: sin dato fiable, callar.
 *
 * `finishedAt` es el momento de ESTE arranque, no el de la muerte —que nadie
 * registró—, así que `durationMs` es un **tope superior**, no la duración real.
 * Por eso el run se guarda con `ok = false` y las ventanas de tendencia solo
 * miran ejecuciones correctas.
 */
export function describeOrphanedSync(
  previous: PreviousSyncRow | null,
  now: Date,
  afterHours: number = STALLED_AFTER_HOURS,
): OrphanedSyncRun | null {
  if (!previous) return null;
  if (previous.finishedAt !== null) return null;

  const startedMs = previous.startedAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(nowMs)) return null;

  const hours = (nowMs - startedMs) / 3_600_000;
  if (hours <= afterHours) return null;

  const fase = previous.notes?.trim();
  const message =
    `la ejecución arrancada el ${previous.startedAt.toISOString()} nunca cerró; ` +
    `se da por muerta al arrancar la siguiente` +
    (fase ? ` (última fase anotada: ${fase})` : " (sin fase anotada)");

  return {
    startedAt: previous.startedAt,
    finishedAt: now,
    ok: false,
    productsFetched: previous.productsFetched,
    productsUpserted: previous.productsUpserted,
    errorsJson: [{ ref: ORPHAN_ERROR_REF, message: message.slice(0, 500) }],
  };
}
