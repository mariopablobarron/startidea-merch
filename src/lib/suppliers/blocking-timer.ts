/**
 * Cronómetro de bloqueo del bucle de eventos.
 *
 * Los syncs de proveedor corren **fire-and-forget dentro del proceso que sirve
 * la web** (`void (async () => …)` en las rutas de cron). Mientras un trozo de
 * código SÍNCRONO se ejecuta, ese proceso no puede atender ninguna petición
 * HTTP: el bucle de eventos está ocupado y el proxy acaba devolviendo 502 a lo
 * que caiga en ese rato — a los crons que coincidan y también a un cliente.
 *
 * En `makito-sync` el sospechoso está identificado: tres `parser.parse(xml)` de
 * `fast-xml-parser`, que es síncrono, sobre un XML de ~17 MB. Lo que faltaba
 * era el NÚMERO: sin saber si bloquea 200 ms o 20 s no se puede decidir entre
 * sacar el sync a un worker aparte, pasar a un parser en streaming o convivir
 * con ello. Esto lo mide, y solo escribe una línea cuando el bloqueo pasa del
 * umbral (un parse rápido no ensucia el log).
 *
 * Es instrumentación pura: no cambia ningún comportamiento ni ningún dato.
 */

/** Por debajo de esto el bloqueo es irrelevante para una petición HTTP. */
export const BLOCKING_WARN_MS = 250;

/**
 * Línea de log, o `null` si el bloqueo no llega al umbral. Separada de la
 * medición para poder fijar el umbral por test sin depender del reloj.
 */
export function blockingLogLine(label: string, ms: number): string | null {
  if (!Number.isFinite(ms) || ms < BLOCKING_WARN_MS) return null;
  return `[bloqueo] ${label}: el bucle de eventos estuvo retenido ${Math.round(ms)} ms`;
}

type MeasureOptions = {
  /** Dónde se escribe la línea. Inyectable para test. */
  emit?: (line: string) => void;
  /** Reloj monótono en ms. Inyectable para test. */
  now?: () => number;
};

/**
 * Ejecuta `fn` (síncrona) midiendo cuánto retiene el bucle de eventos.
 *
 * Devuelve lo que devuelva `fn` y **propaga sus errores tal cual**: si esto
 * cambiara el flujo de un sync, sería instrumentación que rompe lo que mide.
 * También mide (y avisa) cuando `fn` lanza, porque un parse que revienta a los
 * 12 s ha bloqueado esos 12 s igual.
 */
export function measureSyncBlocking<T>(label: string, fn: () => T, options: MeasureOptions = {}): T {
  const now = options.now ?? (() => performance.now());
  const emit = options.emit ?? ((line: string) => console.warn(line));
  const startedAt = now();
  try {
    return fn();
  } finally {
    const line = blockingLogLine(label, now() - startedAt);
    if (line) emit(line);
  }
}
