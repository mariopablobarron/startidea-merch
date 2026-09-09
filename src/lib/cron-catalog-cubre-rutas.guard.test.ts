import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findCron } from "@/lib/cron-catalog";

/**
 * GUARD: toda ruta de `/api/cron/*` que se trackee está en CRON_CATALOG.
 *
 * El hermano de `cron-catalog-cubre-workflows.guard.test.ts`, por el otro
 * extremo. Aquél mira los DISPARADORES (los workflows) y comprueba que cada uno
 * tenga entrada. Este mira las RUTAS, y caza justo el caso que al otro se le
 * escapa: un cron que **no dispara nadie** y que por eso no aparece en ningún
 * workflow ni en el crontab.
 *
 * Descubierto el 2026-09-10: `search-reindex` y `hub-intake-outbox` pasaban por
 * `wrapCronHandler` —o sea que en cuanto se llaman una vez a mano tienen su key
 * `cron_runs_*` y `listCronNames()` los recoge— pero no estaban en el catálogo.
 * Y sin entrada, `silenceWatchability()` los da por vigilables, su umbral cae a
 * DEFAULT_HOURS (30 h) y el watchdog avisa de que llevan un día parados. Un
 * aviso que NADIE puede cerrar, porque no hay disparador que arrancar.
 *
 * No es teoría: el aviso del 2026-09-09 a las 14:54 UTC
 * (`cron_watchdog_last_alert` = `{names:["search-reindex"]}`) era exactamente
 * eso. Y el cuerpo del aviso se trunca a 280 caracteres, así que cada falsa
 * alarma empuja fuera de la pantalla a una de verdad.
 *
 * Por qué NO bastaba lo que ya había: `scripts/audit-crons-vps.sh` decía
 * «catálogo y crontab coinciden» —y era cierto—, porque contrasta el catálogo
 * contra el crontab, no contra las rutas. Un guard verde solo significa que no
 * encontró nada donde miró.
 *
 * Es un guard POR DESCUBRIMIENTO: recorre el directorio de rutas de verdad, sin
 * lista de qué mirar, así que una ruta de cron nueva entra sola en la
 * vigilancia. Una lista blanca solo probaría que no vuelve lo viejo.
 */

const CRON_ROUTES_DIR = join(process.cwd(), "src", "app", "api", "cron");

/** Nombre con el que la ruta se registra en el tracking, leído del código. */
function nombreTrackeado(dir: string): string | null {
  const file = join(CRON_ROUTES_DIR, dir, "route.ts");
  if (!existsSync(file)) return null;
  const src = readFileSync(file, "utf8");
  const m = /wrapCronHandler\(\s*["'`]([^"'`]+)["'`]/.exec(src);
  return m ? m[1] : null;
}

describe("GUARD: CRON_CATALOG cubre las rutas de /api/cron", () => {
  const dirs = readdirSync(CRON_ROUTES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  it("hay rutas que descubrir (si esto falla, el guard dejó de mirar)", () => {
    expect(dirs.length).toBeGreaterThan(10);
  });

  it.each(dirs)("/api/cron/%s tiene entrada en CRON_CATALOG", (dir) => {
    const name = nombreTrackeado(dir);
    if (name === null) return; // no pasa por wrapCronHandler: no se trackea

    const entry = findCron(name);
    expect(
      entry,
      `La ruta /api/cron/${dir} se trackea como "${name}" pero no está en ` +
        `CRON_CATALOG. Sin entrada, el watchdog la vigila por silencio contra ` +
        `un umbral inventado (DEFAULT_HOURS) y avisa de que está parada aunque ` +
        `nada la dispare — una falsa alarma que nadie puede cerrar. Añádela: ` +
        `si algo la dispara, con su expresión cron real; si no, con ` +
        `scheduleCron: "—", que es como se declara "sin disparador, a propósito".`,
    ).not.toBeNull();

    // El endpointPath del catálogo es lo que usa /api/admin/crons/trigger/[name]
    // para relanzar a mano: si miente, el botón del panel pega a otro sitio.
    expect(entry!.endpointPath, `endpointPath de "${name}" no apunta a su ruta`).toBe(
      `/api/cron/${dir}`,
    );
  });
});
