import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  estimateFrequencyHours,
  expectedHoursFor,
  thresholdWindowFor,
} from "@/lib/cron-staleness";

/**
 * GUARD: el umbral de silencio de cada cron contra su `schedule:` REAL.
 *
 * Los umbrales del watchdog son datos escritos a mano, y nadie los contrastaba
 * con lo que dispara los crons de verdad. Eso ha costado ya cinco falsas
 * alarmas, en las dos direcciones:
 *
 *   - `metric-snapshot`: umbral de 2h ("cada hora") para un cron DIARIO → salía
 *     parado ~22 de cada 24 horas.
 *   - `competitor-watch`: sin entrada → caía al default de 30h siendo SEMANAL →
 *     salía parado de martes a domingo, cada semana.
 *
 * El coste no es el ruido en sí: es que el aviso de Telegram se trunca a 280
 * caracteres, así que cada falsa alarma empuja fuera de la vista un problema
 * real (`cifra-sync` parado 3 días con el coste de 2.513 productos congelado).
 *
 * Este test lee los workflows de verdad y falla si el umbral no encaja con la
 * frecuencia que declara su `cron:`. Alcance: solo los crons disparados por
 * GitHub Actions vía la action `cron-trigger`. Los del crontab del VPS no son
 * legibles desde aquí; su frecuencia vive en `CRON_CATALOG.frequencyHours`.
 */

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

type Trigger = { file: string; cron: string; name: string };

function collectScheduledTriggers(): Trigger[] {
  const out: Trigger[] = [];
  for (const file of readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml"))) {
    const src = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    // Solo los que disparan un cron de la app a través de la action compartida.
    if (!src.includes("uses: ./.github/actions/cron-trigger")) continue;
    const cron = /^\s*-\s*cron:\s*["']([^"']+)["']/m.exec(src)?.[1];
    const name = /^\s*name:\s*([\w-]+)\s*$/m.exec(src)?.[1];
    if (!cron || !name) continue; // sin schedule = solo workflow_dispatch
    out.push({ file, cron, name });
  }
  return out;
}

describe("umbral de silencio vs schedule real de los workflows", () => {
  const triggers = collectScheduledTriggers();

  it("encuentra los workflows programados (si esto falla, el guard se quedó ciego)", () => {
    expect(triggers.length).toBeGreaterThanOrEqual(5);
  });

  it.each(triggers)(
    "$name ($cron) tiene un umbral coherente con su frecuencia",
    ({ name, cron, file }) => {
      const freq = estimateFrequencyHours(cron);
      expect(freq, `no se pudo interpretar "${cron}" en ${file}`).not.toBeNull();

      const threshold = expectedHoursFor(name);
      // La ventana admisible vive en cron-staleness.ts, no aquí: es la regla de
      // qué umbrales son legítimos, y reimplementarla en el test significaría
      // que el test no vigila nada (además de esconder que estaba VACÍA para
      // frecuencias por debajo de 2h — ver thresholdWindowFor).
      const { min, max } = thresholdWindowFor(freq!);

      expect(
        threshold,
        `${name}: umbral ${threshold}h para un cron de ~${freq}h (${cron}). ` +
          `Debe estar entre ${Math.round(min)}h y ${Math.round(max)}h — ajusta ` +
          `EXPECTED_HOURS_OVERRIDE["${name}"] en cron-staleness.ts.`,
      ).toBeGreaterThanOrEqual(min);
      expect(threshold).toBeLessThanOrEqual(max);
    },
  );
});

describe("estimateFrequencyHours", () => {
  it.each([
    ["0 * * * *", 1],
    ["17 */6 * * *", 6],
    ["35 3 * * *", 24],
    ["0 6 * * 1", 7 * 24],
    ["0 9 1 * *", 30 * 24],
  ])("%s → %i h", (expr, hours) => {
    expect(estimateFrequencyHours(expr)).toBe(hours);
  });

  it("devuelve null en vez de inventarse un número", () => {
    expect(estimateFrequencyHours("no soy un cron")).toBeNull();
    expect(estimateFrequencyHours("0 0 * *")).toBeNull();
    expect(estimateFrequencyHours("0 */0 * * *")).toBeNull();
  });
});
