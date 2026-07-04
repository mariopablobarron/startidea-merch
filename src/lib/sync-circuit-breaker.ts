/**
 * Circuit-breaker para syncs de proveedores.
 *
 * Problema: si el feed cambia de formato o la API degrada, el sync sigue
 * iterando miles de ítems fallando uno a uno "en silencio" (los errores por
 * iteración se acumulan pero nadie corta) — CPU quemada y catálogo a medias.
 *
 * Regla: corta cuando hay señal SUFICIENTE de fallo sistémico —
 *   - ratio de fallos > maxFailureRatio con al menos minSamples procesados, o
 *   - maxConsecutive fallos seguidos (formato roto desde el primer ítem).
 * Fallos puntuales (un producto malo) NO disparan el corte.
 */
export type SyncBreaker = {
  ok(): void;
  fail(): void;
  /** true si hay que ABORTAR el sync. Comprobar en cada iteración. */
  tripped(): boolean;
  summary(): string;
};

export function createSyncBreaker(opts?: {
  minSamples?: number;
  maxFailureRatio?: number;
  maxConsecutive?: number;
}): SyncBreaker {
  const minSamples = opts?.minSamples ?? 20;
  const maxFailureRatio = opts?.maxFailureRatio ?? 0.3;
  const maxConsecutive = opts?.maxConsecutive ?? 15;

  let successes = 0;
  let failures = 0;
  let consecutive = 0;

  return {
    ok() {
      successes++;
      consecutive = 0;
    },
    fail() {
      failures++;
      consecutive++;
    },
    tripped() {
      if (consecutive >= maxConsecutive) return true;
      const total = successes + failures;
      return total >= minSamples && failures / total > maxFailureRatio;
    },
    summary() {
      const total = successes + failures;
      const pct = total > 0 ? Math.round((failures / total) * 100) : 0;
      return `circuit-breaker: ${failures}/${total} fallos (${pct}%), ${consecutive} consecutivos`;
    },
  };
}
