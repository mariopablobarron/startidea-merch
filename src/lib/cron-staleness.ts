import { findCron } from "@/lib/cron-catalog";

/**
 * Umbral de silencio de los crons para el watchdog (`/api/cron/cron-watchdog`).
 *
 * Fuente de verdad = `CRON_CATALOG.frequencyHours` × margen. Antes el watchdog
 * tenía un mapa hardcodeado aparte y todo lo no listado caía a 30h, con dos
 * fallos:
 *   - un cron del catálogo con frecuencia > 30h (p.ej. `override-price-drift`,
 *     semanal = 168h) se marcaba como parado EN FALSO durante ~5 días de cada
 *     semana;
 *   - un cron de alta frecuencia (webhook-retry, cada 15 min) tardaba 30h en
 *     detectarse muerto.
 *
 * Los overrides quedan solo para crons que NO viven en CRON_CATALOG (los de
 * GitHub Actions: se trackean vía wrapCronHandler pero no están en el catálogo).
 */
export const EXPECTED_HOURS_OVERRIDE: Record<string, number> = {
  "metric-snapshot": 2, // cada hora
  "ai-usage-alert": 30, // diario
  "auto-resolve-errors": 30, // diario
  "product-view-rollup": 30, // diario
  "insights-digest": 8 * 24, // semanal
  "insights-digest-monthly": 35 * 24, // mensual
};

export const DEFAULT_HOURS = 30;

// Un cron puede retrasarse (jitter de cron/GH Actions, carga del VPS) sin estar
// muerto. 2× su frecuencia declarada da holgura sin dejar pasar demasiado
// tiempo uno realmente parado.
export const STALE_MARGIN = 2;

/** Horas de silencio a partir de las cuales un cron se considera "parado". */
export function expectedHoursFor(name: string): number {
  const override = EXPECTED_HOURS_OVERRIDE[name];
  if (override != null) return override;
  const cat = findCron(name);
  if (cat && cat.frequencyHours > 0) return cat.frequencyHours * STALE_MARGIN;
  return DEFAULT_HOURS;
}
