import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard POR DESCUBRIMIENTO — no una lista blanca.
 *
 * El cerrojo de `in-flight-limit.ts` tiene un modo de fallo peor que el
 * problema que resuelve: si un handler adquiere el slot y NO lo libera en un
 * `finally`, la primera excepción deja el endpoint cerrado **para siempre**
 * (hasta que se recree el contenedor). No basta con que hoy esté bien escrito
 * donde se usa; hay que impedir que el próximo uso lo escriba mal.
 *
 * Por eso este test recorre `src/` entero buscando quién llama a
 * `acquireInFlight` en vez de comprobar una lista de ficheros conocidos: una
 * lista blanca solo probaría que no vuelve lo viejo.
 */

const SRC = join(process.cwd(), "src");

function ficherosTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...ficherosTs(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("guard: todo uso de acquireInFlight libera el slot", () => {
  const consumidores = ficherosTs(SRC)
    .map((f) => ({ f, src: readFileSync(f, "utf8") }))
    .filter(
      ({ f, src }) =>
        src.includes("acquireInFlight(") && !f.endsWith(join("lib", "in-flight-limit.ts")),
    );

  it("hay al menos un consumidor (si no, el guard no vigila nada)", () => {
    expect(consumidores.length).toBeGreaterThan(0);
  });

  it.each(consumidores.map(({ f }) => f))("%s libera en un finally", (fichero) => {
    const src = readFileSync(fichero, "utf8");

    // Se comprueba el comportamiento que importa: que exista un `finally` y
    // que dentro se llame al `release()` del slot.
    expect(src, `${fichero} adquiere el slot y no tiene ningún finally`).toMatch(
      /\}\s*finally\s*\{/,
    );

    const bloques = [...src.matchAll(/\}\s*finally\s*\{([\s\S]*?)\n\s*\}/g)].map((m) => m[1]);
    expect(
      bloques.some((b) => /\.release\(\)/.test(b)),
      `${fichero} tiene finally pero ninguno llama a release()`,
    ).toBe(true);
  });
});
