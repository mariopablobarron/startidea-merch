import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard POR DESCUBRIMIENTO de los sinks de HTML crudo.
 *
 * No lleva lista de ficheros: recorre `src/` entero y encuentra por sí mismo
 * cada `dangerouslySetInnerHTML={` y cada `srcDoc=`. Un componente NUEVO que
 * pinte HTML ajeno suspende aquí aunque nadie se acuerde de tocar este test —
 * que es justo lo que una lista blanca no hace.
 *
 * Origen: el 03-sep el preview de broadcasts de /admin metía el cuerpo del
 * email (HTML pegado de terceros) en `dangerouslySetInnerHTML` sin sanear.
 * Se arregló pintándolo en un iframe aislado, no saneándolo: sanear el preview
 * mentiría sobre lo que de verdad llega al buzón.
 */

const SRC = join(process.cwd(), "src");

/** Fuentes cuyo HTML ya viene neutralizado; cualquier otra tiene que justificarse. */
const FUENTES_SANEADAS = ["serializeJsonLd(", "sanitizeBlogHtml"];

function ficherosFuente(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name === ".next") continue;
      salida.push(...ficherosFuente(ruta));
    } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe("guard: todo sink de HTML crudo tiene su frontera", () => {
  const ficheros = ficherosFuente(SRC).map((ruta) => ({
    ruta,
    rel: ruta.slice(SRC.length + 1),
    texto: readFileSync(ruta, "utf8"),
  }));

  it("encuentra ficheros que examinar (el propio barrido no está roto)", () => {
    expect(ficheros.length).toBeGreaterThan(100);
    expect(ficheros.some((f) => f.texto.includes("dangerouslySetInnerHTML={"))).toBe(true);
  });

  it("cada dangerouslySetInnerHTML recibe HTML de una fuente saneada", () => {
    const sinFrontera = ficheros
      .filter((f) => f.texto.includes("dangerouslySetInnerHTML={"))
      .filter((f) => !FUENTES_SANEADAS.some((fuente) => f.texto.includes(fuente)))
      .map((f) => f.rel);

    expect(
      sinFrontera,
      `sink de HTML crudo sin saneado reconocible en: ${sinFrontera.join(", ")}. ` +
        "O lo saneas con sanitizeBlogHtml/serializeJsonLd, o lo pintas en un iframe aislado.",
    ).toEqual([]);
  });

  it("ningún srcDoc se ejecuta: iframe aislado y sin allow-scripts", () => {
    const conSrcDoc = ficheros.filter((f) => f.texto.includes("srcDoc"));
    expect(conSrcDoc.length, "el preview de broadcasts dejó de usar srcDoc").toBeGreaterThan(0);

    for (const fichero of conSrcDoc) {
      expect(fichero.texto, `${fichero.rel}: srcDoc sin sandbox`).toMatch(/sandbox=/);
      expect(
        fichero.texto,
        `${fichero.rel}: el sandbox permite scripts, que es exactamente lo que este iframe evita`,
      ).not.toMatch(/sandbox="[^"]*allow-scripts/);
    }
  });

  it("el preview de broadcasts no vuelve al sink crudo", () => {
    const preview = readFileSync(
      join(SRC, "app", "admin", "marketing", "broadcasts", "[id]", "page.tsx"),
      "utf8",
    );
    expect(preview).not.toContain("dangerouslySetInnerHTML={");
    expect(preview).toContain('sandbox=""');
  });
});
