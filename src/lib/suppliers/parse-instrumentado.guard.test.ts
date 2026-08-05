/**
 * Guard estático: ningún `parser.parse(` de los syncs de proveedor puede
 * quedarse SIN el cronómetro de bloqueo.
 *
 * Existe por una lección concreta y ya pagada (`63baa46`): **testear la función
 * pura no prueba que esté enchufada.** Allí, dos mutaciones del cableado
 * pasaron verdes porque los tests solo cubrían la lógica aislada, y el fallo
 * original volvía con toda la lógica nueva intacta. Aquí pasaría lo mismo: los
 * tests de `blocking-timer` seguirían verdes aunque alguien quitara el
 * `measureSyncBlocking` de `makito-sync`, y volveríamos a no tener ni idea de
 * cuántos segundos bloquea el parse.
 *
 * Lee el FUENTE, que es la única forma de comprobar cableado sin ejecutar un
 * sync de verdad contra el feed del proveedor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src/lib/suppliers");

/**
 * Una línea de comentario que MENCIONA `parser.parse(` no es una llamada — y sí
 * llega a haberlas, empezando por la cabecera de `blocking-timer.ts`, que
 * explica justo esto. Sin este filtro el guard se dispara con su propia
 * documentación (pasó a la primera).
 */
function esComentario(linea: string): boolean {
  return /^\s*(\/\/|\/\*|\*)/.test(linea);
}

/** Ficheros de sync con llamadas REALES a parse de XML de proveedor. */
function ficherosConParseXml(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) =>
      readFileSync(join(DIR, f), "utf-8")
        .split("\n")
        .some((l) => l.includes("parser.parse(") && !esComentario(l)),
    );
}

describe("guard · todo parse XML de proveedor está cronometrado", () => {
  it("hay al menos un fichero con parse XML (si no, el guard no vigila nada)", () => {
    // Sin esto el guard sería vacuamente verde el día que alguien renombre algo.
    expect(ficherosConParseXml().length).toBeGreaterThan(0);
  });

  it("ninguna llamada a parser.parse( queda fuera de measureSyncBlocking", () => {
    const sinCronometrar: string[] = [];

    for (const fichero of ficherosConParseXml()) {
      const lineas = readFileSync(join(DIR, fichero), "utf-8").split("\n");
      lineas.forEach((linea, i) => {
        if (!linea.includes("parser.parse(") || esComentario(linea)) return;
        // El cableado correcto envuelve la llamada en la misma línea:
        //   measureSyncBlocking("…", () => parser.parse(xml))
        if (linea.includes("measureSyncBlocking")) return;
        sinCronometrar.push(`${fichero}:${i + 1} → ${linea.trim()}`);
      });
    }

    expect(sinCronometrar).toEqual([]);
  });
});
