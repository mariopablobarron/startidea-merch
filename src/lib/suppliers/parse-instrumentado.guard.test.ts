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

/**
 * Clientes que descargan un CATÁLOGO entero de proveedor. Lista literal a
 * propósito: si alguien renombra uno, `readFileSync` revienta con ENOENT y el
 * guard se entera, en vez de quedarse mirando un conjunto vacío.
 *
 * Makito no está aquí porque su feed es XML y lo cubre el bloque de arriba.
 */
const CLIENTES_DE_CATALOGO = ["midocean.ts", "cifra.ts"];

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

/**
 * El hermano del de arriba, para JSON.
 *
 * Se escribió el 6-ago después de medir Makito por primera vez: al buscar quién
 * más tenía la misma forma resultó que **los otros dos proveedores también**.
 * MidOcean convierte ~25 MB de JSON y Cifra su catálogo entero, los dos con
 * `res.json()`, que por dentro es un `JSON.parse` síncrono. Bloqueaban el bucle
 * exactamente igual que el XML; la única diferencia era que nadie lo medía —y
 * el guard anterior no podía verlo, porque solo buscaba `parser.parse(`.
 *
 * La regla es deliberadamente tosca: en un cliente de catálogo **todo** `.json()`
 * va medido, sin excepciones por «esa respuesta es pequeña». Juzgar cuál merece
 * cronómetro es justo la decisión que dejó a estos dos sin él durante meses, y
 * el umbral de 250 ms ya hace que las respuestas pequeñas no escriban nada.
 */
describe("guard · los clientes de catálogo no convierten JSON sin medirlo", () => {
  it.each(CLIENTES_DE_CATALOGO)("%s importa el cronómetro", (fichero) => {
    const fuente = readFileSync(join(DIR, fichero), "utf-8");
    expect(fuente).toMatch(/measuredJson/);
  });

  it.each(CLIENTES_DE_CATALOGO)("%s no deja ningún .json() crudo", (fichero) => {
    const crudos = readFileSync(join(DIR, fichero), "utf-8")
      .split("\n")
      .map((linea, i) => ({ linea: linea.trim(), n: i + 1 }))
      .filter(({ linea }) => /\.json\(\)/.test(linea) && !esComentario(linea))
      .filter(({ linea }) => !linea.includes("measuredJson"));

    expect(
      crudos.map((c) => `${fichero}:${c.n}  ${c.linea}`),
      `Convertir el cuerpo con .json() retiene el bucle de eventos mientras dura, ` +
        `y aquí se descargan catálogos de MB. Usa measuredJson(etiqueta, res) — ` +
        `ver src/lib/suppliers/blocking-timer.ts.`,
    ).toEqual([]);
  });

  it("los ficheros vigilados existen y traen JSON de verdad (anti-falso-verde)", () => {
    // Un guard que mira ficheros vacíos o inexistentes pasa para siempre.
    for (const fichero of CLIENTES_DE_CATALOGO) {
      const fuente = readFileSync(join(DIR, fichero), "utf-8");
      expect(fuente, `${fichero}: no parece un cliente HTTP`).toMatch(/await fetch\(/);
    }
  });
});
