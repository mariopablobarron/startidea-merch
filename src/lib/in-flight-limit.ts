/**
 * Cerrojo de CONCURRENCIA en memoria del proceso — cuántas peticiones caras
 * pueden estar en vuelo A LA VEZ, sin importar de quién vengan.
 *
 * Por qué no basta el rate limit que ya hay: `rateLimit()` cuenta por IP, y
 * eso protege del abuso de UNA IP pero no del recurso. Un handler que retiene
 * el proceso durante minutos y varios GB de RAM se tumba igual con N IPs
 * distintas pidiendo una vez cada una — que es el modo de fallo real del
 * `merch-app` (el VPS ya se ha caído por OOM dos veces). El límite que salva
 * ahí no es "cuántas por cliente" sino "cuántas simultáneas en total".
 *
 * Alcance: memoria del proceso Node, igual que rate-limit.ts. Vale porque el
 * setup es un contenedor; si algún día se escala a varias instancias, el tope
 * pasa a ser por instancia (sigue acotando, pero hay que recalcularlo).
 *
 * Uso — el `release()` va SIEMPRE en un `finally`, o el cerrojo se queda
 * cerrado para siempre tras la primera excepción:
 *
 *   const slot = acquireInFlight({ key: "search-semantic", max: 1 });
 *   if (!slot.ok) return slot.response;
 *   try {
 *     // … trabajo caro
 *   } finally {
 *     slot.release();
 *   }
 */

import { NextResponse } from "next/server";

const COUNTS = new Map<string, number>();

export type InFlightOpts = {
  /** Identificador del bucket (uno por endpoint caro). */
  key: string;
  /** Máximo de peticiones simultáneas. */
  max: number;
  /** Segundos que se le piden al cliente antes de reintentar. */
  retryAfterSeconds?: number;
  /** Mensaje al cliente. Sin detalles internos: es una ruta pública. */
  message?: string;
};

export type InFlightResult =
  | { ok: true; release: () => void }
  | { ok: false; response: NextResponse };

export function acquireInFlight(opts: InFlightOpts): InFlightResult {
  const current = COUNTS.get(opts.key) ?? 0;

  if (current >= opts.max) {
    const retryAfter = opts.retryAfterSeconds ?? 30;
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: opts.message ?? "El servicio está ocupado. Inténtalo en unos segundos.",
          retryAfterSeconds: retryAfter,
        },
        { status: 503, headers: { "Retry-After": String(retryAfter) } },
      ),
    };
  }

  COUNTS.set(opts.key, current + 1);

  // Idempotente: un `release()` llamado dos veces (p. ej. un `finally` dentro
  // de otro `finally`) no puede dejar el contador por debajo de lo real y
  // abrir el cerrojo de más.
  let released = false;
  return {
    ok: true,
    release() {
      if (released) return;
      released = true;
      const n = (COUNTS.get(opts.key) ?? 1) - 1;
      if (n <= 0) COUNTS.delete(opts.key);
      else COUNTS.set(opts.key, n);
    },
  };
}

/** Solo para tests: vacía el estado entre casos. */
export function __resetInFlightForTests() {
  COUNTS.clear();
}

/** Solo para tests/diagnóstico: cuántas hay en vuelo ahora mismo. */
export function inFlightCount(key: string): number {
  return COUNTS.get(key) ?? 0;
}
