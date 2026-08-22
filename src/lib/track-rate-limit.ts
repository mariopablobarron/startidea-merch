/**
 * Cupos de las rutas de tracking (`/api/track/*`).
 *
 * Las tres son fire-and-forget desde el navegador y ninguna pedía credenciales
 * ni tenía tope: cada POST escribe en BD (un `upsert`), así que un bucle desde
 * una sola IP puede (1) inflar los contadores que alimentan «lo más visto» y el
 * recomendador, y (2) en el caso de `referrer`, **crear filas nuevas** en
 * `ReferrerLog` con hosts inventados — el spam de referrer de toda la vida.
 *
 * Los cupos se eligen por encima del uso legítimo medido en el propio código:
 * `product-event` dispara 1 `view` por producto abierto (navegar rápido un
 * catálogo son decenas en pocos minutos) y `referrer` 1 sola vez por sesión.
 * No pretenden ser antifraude: cortan el bucle, no al usuario real.
 */
import { rateLimit } from "@/lib/rate-limit";

export const TRACK_LIMITS = {
  /** 1 por producto abierto: holgado para navegación real, corta un bucle. */
  "track-product-event": { max: 120, windowMs: 5 * 60_000 },
  /** Mismo perfil: varios eventos A/B por sesión de navegación. */
  "track-experiment-event": { max: 120, windowMs: 5 * 60_000 },
  /** 1 por sesión; es el único que puede CREAR filas con host arbitrario. */
  "track-referrer": { max: 20, windowMs: 5 * 60_000 },
} as const;

export type TrackBucket = keyof typeof TRACK_LIMITS;

/** Aplica el cupo del bucket. Devuelve el resultado de `rateLimit` tal cual. */
export function trackRateLimit(req: Request, bucket: TrackBucket) {
  const { max, windowMs } = TRACK_LIMITS[bucket];
  return rateLimit(req, { key: bucket, max, windowMs });
}
