import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { descripcionPublica, descripcionPublicaONull } from "./public-description";

/**
 * GUARD por DESCUBRIMIENTO: ninguna superficie pública emite el texto del
 * proveedor sin pasar por la frontera de salida.
 *
 * El 06-sep-2026 el barrido anti-fuga cazó, en `/catalogo/…`, la frase del
 * catálogo MAYORISTA publicada en la meta description —y con ella en og:,
 * twitter: y el JSON-LD, es decir, en lo que Google indexa—. Eran 59 fichas
 * ACTIVAS. El saneador existía desde la PR #57 y su guard estaba verde: los
 * dos miran la ENTRADA, y esas filas entraron antes, de un proveedor de import
 * MANUAL que nada ha vuelto a tocar.
 *
 * Por eso este guard no repite lo que ya vigila `no-wholesale-jargon` (el
 * seed) ni lo que vigila el barrido (producción, por muestreo, y solo cuando
 * la ruta cae en la muestra). Vigila el CÓDIGO: recorre el árbol de superficies
 * públicas y exige que, allí donde se emita un campo descriptivo del
 * proveedor, se emita saneado. Lo que caza es la superficie pública SIGUIENTE
 * —la que aún no existe— no la lista de las de hoy.
 */

const RAIZ = join(__dirname, "..");
const SUPERFICIES = ["app", "lib/search"];

/** El panel sí puede ver el texto del proveedor: no es superficie pública. */
const EXCLUIDOS = [`${"/"}admin/`, "/api/admin/", "/api/cron/", "/suppliers/"];

/** Campos descriptivos que vienen del feed del proveedor. */
const CAMPOS = /\b(?:shortDescription|longDescription|enhancedShortDescription)\b/;

function ficherosDe(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...ficherosDe(ruta));
      continue;
    }
    if (!/\.tsx?$/.test(entrada) || /\.(?:test|guard\.test)\.tsx?$/.test(entrada)) continue;
    salida.push(ruta);
  }
  return salida;
}

describe("frontera de salida de la descripción de proveedor", () => {
  it("ninguna superficie pública emite un campo descriptivo sin sanear", () => {
    const infractoras: string[] = [];

    for (const superficie of SUPERFICIES) {
      for (const ruta of ficherosDe(join(RAIZ, superficie))) {
        const relativa = ruta.slice(RAIZ.length);
        if (EXCLUIDOS.some((e) => relativa.includes(e))) continue;

        const lineas = readFileSync(ruta, "utf8").split("\n");
        lineas.forEach((linea, i) => {
          // Solo interesa la EMISIÓN: `legacyHtmlToText(<campo>)` o el campo
          // interpolado tal cual. Un `select: { shortDescription: true }` o un
          // `where` no emiten nada.
          const emiteCrudo =
            /legacyHtmlToText\(\s*$/.test(linea) === false &&
            CAMPOS.test(linea) &&
            /legacyHtmlToText\([^)]*(?:shortDescription|longDescription)/.test(linea);
          if (emiteCrudo) infractoras.push(`${relativa}:${i + 1}`);
        });
      }
    }

    expect(
      infractoras,
      `Estas superficies públicas emiten texto de proveedor sin sanear. ` +
        `Usa descripcionPublica()/descripcionPublicaONull() de src/lib/public-description.ts:\n` +
        infractoras.join("\n"),
    ).toEqual([]);
  });

  it("la frase real que se publicó en 59 fichas activas no sobrevive a la frontera", () => {
    // Copiada literal de producción el 06-sep-2026
    // (/catalogo/pared-completa-a-doble-cara-3x19m).
    const real =
      "Pared completa a doble cara ✓ Exclusiva para Rotulistas y Distribuidores " +
      "✓ 100% Online ✓ Fabricación y entrega en 24h【30% de margen】Envío gratis.";
    const limpio = descripcionPublica(real);

    expect(limpio).not.toMatch(/rotulistas/i);
    expect(limpio).not.toMatch(/de margen/i);
    expect(limpio).not.toMatch(/100\s*%\s*online/i);
    expect(limpio).not.toMatch(/env[ií]o\s+gratis/i);
    expect(limpio).not.toMatch(/entrega en 24/i);
    // Y queda algo útil, no una cadena vacía ni una frase mutilada.
    expect(limpio).toMatch(/Pared completa a doble cara/);
  });

  it("la variante sin «rotulistas» —36 de las 59— también cae", () => {
    const real =
      "Banderas con palo personalizadas ✓ Exclusivamente para Distribuidores " +
      "✓ 100% Online ✓ Fabricación y entrega en 24h【30% de margen】Envío gratis.";
    const limpio = descripcionPublica(real);
    expect(limpio).not.toMatch(/para Distribuidores/i);
    expect(limpio).not.toMatch(/de margen/i);
    expect(limpio).toMatch(/Banderas con palo personalizadas/);
  });

  it("un texto de proveedor limpio pasa intacto", () => {
    const limpio = "Mochila de poliéster reciclado con bolsillo acolchado para portátil.";
    expect(descripcionPublica(limpio)).toBe(limpio);
  });

  it("la variante ONull deja desaparecer el campo en vez de mandar cadena vacía", () => {
    expect(descripcionPublicaONull(null)).toBeNull();
    expect(descripcionPublica(null)).toBe("");
  });
});

/**
 * Cobertura propia. Este guard recorre el árbol de superficies públicas: si
 * `SUPERFICIES` deja de resolver (un renombrado de `app/`), o si las
 * exclusiones se amplían de más, el recorrido se queda vacío y el `toEqual([])`
 * de arriba pasa para siempre — con la fuga viva, que es exactamente como
 * llegó a producción el argumentario mayorista. Medido el 10-sep-2026:
 * 140 ficheros recorridos, 8 de ellos con un campo descriptivo del proveedor.
 */
describe("el guard sigue mirando superficies de verdad (cobertura propia)", () => {
  const recorridas = SUPERFICIES.flatMap((s) =>
    ficherosDe(join(RAIZ, s))
      .map((r) => r.slice(RAIZ.length))
      .filter((rel) => !EXCLUIDOS.some((e) => rel.includes(e))),
  );

  it("recorre el árbol público entero, no un puñado de ficheros", () => {
    expect(recorridas.length).toBeGreaterThan(80);
  });

  it("la ficha de producto —donde se publicó la fuga— está dentro", () => {
    expect(recorridas.some((r) => r.includes("app/catalogo/[slug]/page.tsx"))).toBe(true);
  });

  it("sigue habiendo campos descriptivos del proveedor que vigilar", () => {
    const conCampos = SUPERFICIES.flatMap((s) =>
      ficherosDe(join(RAIZ, s)).filter((r) => {
        const rel = r.slice(RAIZ.length);
        if (EXCLUIDOS.some((e) => rel.includes(e))) return false;
        return CAMPOS.test(readFileSync(r, "utf8"));
      }),
    );
    expect(conCampos.length).toBeGreaterThan(2);
  });
});
