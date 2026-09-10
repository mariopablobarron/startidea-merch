import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El formato de arte final que se le promete al cliente sale en TRES sitios del
 * mismo presupuesto, y el 10-sep se descubrió —mirando el PDF— que no decían lo
 * mismo:
 *
 *   · plantilla, ficha técnica (pág. 2)   → «Vectorial (.ai, .eps o .pdf)»
 *   · plantilla, condición 05 (pág. 3)    → «vectorial (.ai, .eps o .pdf)»
 *   · `cotizar-desde-bd.ts`, por defecto  → «Vector (PDF, AI o SVG)»   ← se salía
 *
 * O sea que un presupuesto salido de la base de datos le decía al cliente, en la
 * misma página, que se acepta SVG (arriba) y que hace falta .eps (abajo). La
 * cláusula 05 es la que obliga, así que manda ella.
 *
 * Este guard NO lleva lista de qué mirar: extrae la extensión de cada sitio y
 * las compara. Si mañana la empresa decide aceptar SVG de verdad, hay que
 * cambiar la cláusula y este test lo obliga a cambiarse entero, no a medias.
 */

const raiz = path.resolve(__dirname, "..", "..");

function leer(rel: string): string {
  return readFileSync(path.join(raiz, rel), "utf8");
}

/** Extensiones («.ai», «.eps», «.pdf», «svg»…) que nombra un texto, normalizadas. */
function extensionesDe(texto: string): string[] {
  const halladas = new Set<string>();
  for (const m of texto.matchAll(/\.?\b(ai|eps|pdf|svg|cdr|png|jpg)\b/gi)) {
    halladas.add(m[1]!.toLowerCase());
  }
  return [...halladas].sort();
}

describe("el formato de arte final dice lo mismo en todo el presupuesto", () => {
  const plantilla = leer("presupuestos/plantilla-presupuesto-startidea.html");

  // Las frases de la plantilla, por descubrimiento: cualquier sitio donde se
  // hable de arte final «vectorial (…)».
  const frasesPlantilla = [...plantilla.matchAll(/[Vv]ectorial\s*\(([^)]+)\)/g)].map((m) => m[1]!);

  it("la plantilla nombra el formato al menos dos veces (ficha y condiciones)", () => {
    expect(frasesPlantilla.length).toBeGreaterThanOrEqual(2);
  });

  it("todas las frases de la plantilla nombran las mismas extensiones", () => {
    const juegos = frasesPlantilla.map((f) => extensionesDe(f).join(","));
    expect(new Set(juegos).size).toBe(1);
  });

  it("el valor por defecto de cotizar-desde-bd.ts no contradice a la plantilla", () => {
    const script = leer("scripts/cotizar-desde-bd.ts");
    const m = script.match(/formato:\s*arg\("formato",\s*"([^"]+)"\)/);
    expect(m, "no encuentro el valor por defecto de --formato en el script").not.toBeNull();

    const delScript = extensionesDe(m![1]!);
    const deLaPlantilla = extensionesDe(frasesPlantilla[0]!);
    expect(delScript).toEqual(deLaPlantilla);
  });

  it("el ejemplo de montar-presupuesto.py tampoco la contradice", () => {
    const py = leer("presupuestos/montar-presupuesto.py");
    const m = py.match(/"formato":\s*"([^"]+)"/);
    expect(m, "no encuentro el «formato» del pedido de ejemplo").not.toBeNull();

    expect(extensionesDe(m![1]!)).toEqual(extensionesDe(frasesPlantilla[0]!));
  });
});
