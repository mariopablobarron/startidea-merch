import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CRON_CATALOG, findCron } from "@/lib/cron-catalog";

/**
 * GUARD: todo cron de la app que dispare GitHub Actions está en CRON_CATALOG.
 *
 * Descubierto el 2026-09-01: había NUEVE crons corriendo a diario sin entrada
 * en el catálogo (`metric-snapshot`, `product-view-rollup`,
 * `makito-marking-enrich`, `auto-resolve-errors`, `ai-usage-alert`,
 * `cron-watchdog`, `insights-digest`, `insights-digest-monthly` y
 * `competitor-watch`). Solo `embeddings-sync` estaba registrado.
 *
 * ⚠️ Lo que faltar del catálogo NO significa: no significa estar sin vigilar.
 * `listCronNames()` recoge a cualquiera que haya pasado una vez por
 * `wrapCronHandler`, y `silenceWatchability()` trata como vigilable lo que no
 * conoce. Escribir aquí "estaban desatendidos" habría sido falso, y por eso se
 * deja dicho: el aviso por silencio ya los cubría.
 *
 * Lo que SÍ falta sin entrada, y es lo que este guard defiende:
 *   - no salen en /admin/system/crons ni en /api/admin/crons;
 *   - **no se pueden relanzar a mano**: /api/admin/crons/trigger/[name]
 *     responde 404 a todo lo que no esté aquí (route.ts, `findCron`).
 *
 * El día que lo demostró: el disparo de `metric-snapshot` del 2026-09-01 falló
 * —tres intentos, la petición no llegó a salir del runner de GitHub, el sitio
 * estaba levantado— y la fila de ese día se perdió. No es reconstruible a
 * posteriori (`views30d`/`cartAdds30d` salen de contadores rodantes que el
 * rollup resetea), así que la única recuperación posible era volver a
 * dispararlo el mismo día… y no había forma de hacerlo desde el panel.
 *
 * Es un guard POR DESCUBRIMIENTO, no una lista blanca: recorre los workflows
 * de verdad, así que un cron nuevo entra solo en la vigilancia. Una lista
 * escrita a mano solo probaría que no vuelve lo viejo.
 *
 * ALCANCE: solo los crons disparados por GitHub Actions con la action
 * compartida `cron-trigger`. Los del crontab del VPS no son legibles desde CI
 * — eso lo contrasta `scripts/audit-crons-vps.sh`, que corre contra la máquina.
 */

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

type Disparo = {
  file: string;
  /** nombre que el workflow pasa a la action `cron-trigger` */
  name: string;
  /** ruta de la app a la que pega, extraída del `url:` del workflow */
  endpointPath: string;
  /** expresión cron literal del workflow, o null si es solo workflow_dispatch */
  cron: string | null;
};

function collectDisparos(): Disparo[] {
  const out: Disparo[] = [];
  for (const file of readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml"))) {
    const src = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    if (!src.includes("uses: ./.github/actions/cron-trigger")) continue;

    // El `url:` es la fuente de verdad de a qué endpoint pega de verdad; el
    // `name:` es solo la etiqueta. Si divergen, manda la URL.
    const endpointPath = /url:\s*\S*?(\/api\/cron\/[a-z0-9-]+)/.exec(src)?.[1];
    if (!endpointPath) continue;

    const name = /^\s*name:\s*([\w-]+)\s*$/m.exec(src)?.[1] ?? endpointPath.split("/").pop()!;
    const cron = /^\s*-\s*cron:\s*["']([^"']+)["']/m.exec(src)?.[1] ?? null;
    out.push({ file, name, endpointPath, cron });
  }
  return out;
}

describe("CRON_CATALOG cubre los crons que dispara GitHub Actions", () => {
  const disparos = collectDisparos();

  it("encuentra los workflows (si esto falla, el guard se quedó ciego)", () => {
    // Si un refactor cambia el nombre de la action o la forma del `url:`, el
    // recorrido devolvería 0 y el guard pasaría verde sin mirar nada.
    expect(disparos.length).toBeGreaterThanOrEqual(10);
  });

  it.each(disparos)(
    "$name está en el catálogo y por tanto se puede relanzar a mano",
    ({ name, file, endpointPath }) => {
      const entrada = findCron(name);
      expect(
        entrada,
        `${file} dispara "${name}" (${endpointPath}) pero no hay entrada en ` +
          `CRON_CATALOG. Sin ella, /api/admin/crons/trigger/${name} responde ` +
          `404 y ese cron no se puede relanzar desde el panel el día que su ` +
          `disparo falle. Añádela en src/lib/cron-catalog.ts.`,
      ).not.toBeNull();

      expect(
        entrada!.endpointPath,
        `${name}: el catálogo apunta a ${entrada!.endpointPath} y el workflow ` +
          `${file} pega a ${endpointPath}.`,
      ).toBe(endpointPath);
    },
  );

  it.each(disparos.filter((d) => d.cron !== null))(
    "$name copia en scheduleCron la expresión literal de su workflow",
    ({ name, cron, file }) => {
      const entrada = findCron(name);
      if (!entrada) return; // ya lo suspende el test de arriba
      expect(
        entrada.scheduleCron,
        `${name}: el catálogo dice "${entrada.scheduleCron}" y ${file} ` +
          `dispara "${cron}". scheduleCron se copia LITERAL de su origen: si ` +
          `no coincide carácter a carácter, el catálogo miente.`,
      ).toBe(cron);
    },
  );

  it("un cron que dispara el crontab del VPS no conserva además `schedule` en su workflow", () => {
    // El fallo que cierra: DOS disparadores para el mismo cron. Ya pasó el
    // 2026-07-20 —crontab del VPS + `schedule` de GitHub Actions a la vez— y
    // no se vio como duplicado, se vio como AVERÍA: el segundo disparo choca
    // con `cron-lock` y devuelve 409, así que el panel se llena de fallos de
    // un cron que en realidad había corrido bien.
    //
    // Es el riesgo concreto que abre la mudanza del 2026-09-01: al mover
    // `product-view-rollup` y `metric-snapshot` al crontab, sus workflows se
    // quedan con `workflow_dispatch` a propósito (para poder relanzarlos a
    // mano). Devolverles el `schedule` de un `git revert` distraído reproduce
    // el doble disparo, y este guard lo suspende antes.
    const mudados = disparos.filter((d) => findCron(d.name)?.schedule.includes("local VPS"));

    // Cobertura: si el emparejamiento deja de encontrar mudados, lo de abajo
    // pasaría verde sin mirar nada.
    expect(
      mudados.length,
      "ningún workflow corresponde a un cron declarado en el crontab del VPS: " +
        "el emparejamiento catálogo↔workflow se ha roto y este guard está ciego",
    ).toBeGreaterThanOrEqual(2);

    const dobles = mudados
      .filter((d) => d.cron !== null)
      .map(
        (d) =>
          `${d.file}: el catálogo dice que a "${d.name}" lo dispara el crontab ` +
          `del VPS ("${findCron(d.name)!.schedule}") pero el workflow mantiene ` +
          `schedule "${d.cron}". Los dos disparos chocan en cron-lock y el ` +
          `segundo devuelve 409, que se lee como fallo del cron.`,
      );

    expect(dobles).toEqual([]);
  });

  it("no deja entradas del catálogo apuntando a un endpoint inexistente", () => {
    // El reverso: el catálogo tampoco debe inventarse crons de GitHub Actions.
    const porNombre = new Map(disparos.map((d) => [d.name, d]));
    const inventados = CRON_CATALOG.filter((c) => {
      const d = porNombre.get(c.name);
      return d != null && d.endpointPath !== c.endpointPath;
    });
    expect(inventados.map((c) => c.name)).toEqual([]);
  });
});
