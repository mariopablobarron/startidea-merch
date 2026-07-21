import { describe, it, expect } from "vitest";
import { expectedHoursFor } from "./cron-staleness";

/**
 * Se testea contra el CRON_CATALOG REAL (no mockeado) para fijar los umbrales
 * de verdad. Si alguien cambia la frecuencia de un cron en el catálogo, estos
 * valores cambian con él — que es justo lo que queremos (una sola fuente de
 * verdad).
 */
describe("expectedHoursFor — umbral de silencio del cron-watchdog", () => {
  it("cron del catálogo: deriva de frequencyHours × 2", () => {
    // midocean-sync = diario (24h) en CRON_CATALOG.
    expect(expectedHoursFor("midocean-sync")).toBe(48);
  });

  it("REGRESIÓN: un cron semanal del catálogo ya NO cae al default 30h", () => {
    // override-price-drift = semanal (168h). Antes: 30h → falsa alarma cada
    // semana durante ~5 días. Ahora holgura sobre la ejecución semanal.
    const h = expectedHoursFor("override-price-drift");
    expect(h).toBe(336);
    expect(h).toBeGreaterThan(168);
  });

  it("cron de alta frecuencia del catálogo: umbral pequeño (detección rápida, no 30h)", () => {
    // webhook-retry = cada 15 min (0.25h) en CRON_CATALOG.
    expect(expectedHoursFor("webhook-retry")).toBe(0.5);
  });

  it("override manual (cron de GitHub Actions, no en el catálogo) gana sobre la derivación", () => {
    expect(expectedHoursFor("insights-digest")).toBe(8 * 24);
    expect(expectedHoursFor("metric-snapshot")).toBe(2);
  });

  it("cron desconocido (ni override ni catálogo) → default 30h", () => {
    expect(expectedHoursFor("cron-inventado-que-no-existe")).toBe(30);
  });

  it("cualquier cron del catálogo obtiene un umbral > 0 y finito", () => {
    // Blindaje: ningún cron del catálogo debe quedar con umbral 0/NaN.
    for (const name of ["makito-sync", "cifra-sync", "voice-agent-health", "backup-db"]) {
      const h = expectedHoursFor(name);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
  });
});
