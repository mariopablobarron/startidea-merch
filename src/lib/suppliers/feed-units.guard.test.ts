import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD estático de las conversiones del feed, hermano del guard de texto de
 * proveedor (`no-raw-supplier-text.guard.test.ts`).
 *
 * Lo que impone, y por qué:
 *
 *  1. Ningún XML de proveedor se parsea con `parseTagValue: true`. Dejar que
 *     fast-xml-parser adivine qué es número es lo que publicó el catálogo
 *     entero con el stock dividido por mil: `<stock>90.000</stock>` le parece
 *     noventa. Se lee en crudo y se convierte donde se sabe qué es cada campo.
 *
 *  2. `stockQty` se escribe desde `parseFeedCount` (o desde un valor que ya es
 *     un número del proveedor, como el JSON de MidOcean). Nunca desde
 *     `parseInt`/`parseFloat`/`toNum` a secas, que se paran en el punto de
 *     millar.
 *
 * Si añades un proveedor, pasa sus cantidades por `parseFeedCount`.
 */

const DIR = "src/lib/suppliers";

/**
 * Se miran solo las líneas de CÓDIGO: los comentarios de este repositorio
 * citan el fallo a la letra ("parseTagValue: true"), y un guard que se
 * dispara con la documentación del propio fallo acaba borrándose.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");
}

function fuentes(): { rel: string; src: string }[] {
  return readdirSync(join(process.cwd(), DIR))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({
      rel: `${DIR}/${f}`,
      src: sinComentarios(readFileSync(join(process.cwd(), DIR, f), "utf8")),
    }));
}

describe("guard · el XML de proveedor se lee en crudo", () => {
  it("nadie vuelve a poner parseTagValue: true", () => {
    const culpables = fuentes()
      .filter(({ src }) => /parseTagValue\s*:\s*true/.test(src))
      .map(({ rel }) => rel);

    expect(culpables, `parseTagValue:true en ${culpables.join(", ")}`).toEqual([]);
  });

  it("los parsers que quedan lo desactivan explícitamente, no por defecto", () => {
    // El defecto de la librería es `true`. Un parser sin la opción es un
    // parser que vuelve a adivinar.
    for (const { rel, src } of fuentes()) {
      const parsers = src.match(/new XMLParser\(\{[^}]*\}\)/g) ?? [];
      for (const p of parsers) {
        expect(p, `${rel}: XMLParser sin parseTagValue:false`).toMatch(/parseTagValue\s*:\s*false/);
      }
    }
  });
});

describe("guard · el stock se escribe desde el parser de cantidades", () => {
  it("ninguna asignación de stockQty usa parseInt/parseFloat/toNum", () => {
    const malas: string[] = [];
    for (const { rel, src } of fuentes()) {
      src.split("\n").forEach((linea, i) => {
        if (!/stockQty\s*:/.test(linea)) return;
        if (/parseInt|parseFloat|toNum|Number\(/.test(linea)) {
          malas.push(`${rel}:${i + 1} → ${linea.trim()}`);
        }
      });
    }
    expect(malas, malas.join("\n")).toEqual([]);
  });
});
