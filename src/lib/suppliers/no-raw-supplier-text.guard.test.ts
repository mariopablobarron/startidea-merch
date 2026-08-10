import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD estático anti-fuga de TEXTO de proveedor, hermano del guard de imágenes
 * (`src/app/api/no-raw-provider-image.guard.test.ts`).
 *
 * La fuga del 2026-07-28 (5 fichas de Cifra sirviendo "produccion@cifra.es" en
 * la meta description) entró por el mapper del sync, no por una ruta: el feed
 * trae notas internas del proveedor y el sync las escribía tal cual en campos
 * que la ficha pública pinta. Sanear la BD no bastaba — el siguiente sync lo
 * reescribía.
 *
 * Regla que este test IMPONE en CI:
 *   Todo campo de TEXTO LIBRE que un sync de proveedor escriba en Product o
 *   ProductVariant tiene que pasar por sanitizeSupplierText/sanitizeSupplierName.
 *
 * Si añades un proveedor o un campo de texto nuevo: sanéalo. No añadas
 * excepciones aquí sin una razón muy clara.
 */

const SYNC_FILES = [
  "src/lib/suppliers/midocean-sync.ts",
  "src/lib/suppliers/cifra-sync.ts",
  "src/lib/suppliers/makito-sync.ts",
];

/** Campos de texto libre que acaban en la ficha pública / meta tags. */
const TEXT_FIELDS = [
  "name",
  "brand",
  "shortDescription",
  "longDescription",
  "material",
  "markingTechniqueHint",
  "markingSizeHint",
  "colorName",
];

const SANITIZER = /sanitizeSupplier(Text|Name)\s*\(/;
const ASSIGNMENT_LINE = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/;

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * Une las líneas de CONTINUACIÓN antes de analizar.
 *
 * ⚠️ Hasta el 2026-08-10 este guard miraba línea a línea, así que una
 * asignación partida —justo lo que produce el formateador cuando la línea se
 * pasa de ancho— era INVISIBLE para él:
 *
 *     shortDescription:
 *       raw.description,
 *
 * La primera línea no casa (no hay nada tras los dos puntos) y la segunda
 * tampoco (no hay clave). El campo quedaba sin auditar y, peor, si TODAS sus
 * asignaciones estuvieran así, el `continue` de más abajo daba por hecho que
 * ese proveedor "no aporta ese campo". Un guard ciego que además se declara
 * satisfecho.
 *
 * Se conserva el número de línea de la CLAVE (que es donde hay que ir a
 * mirar), en vez de colapsar el fichero entero.
 */
function logicalLines(src: string): { line: number; text: string }[] {
  const fisicas = src.split("\n");
  const out: { line: number; text: string }[] = [];

  for (let i = 0; i < fisicas.length; i++) {
    let texto = fisicas[i].trim();
    // Una clave sin valor detrás continúa en las líneas siguientes.
    if (/^[A-Za-z_$][\w$]*\s*:$/.test(texto)) {
      let j = i + 1;
      while (j < fisicas.length && fisicas[j].trim() === "") j++;
      // Se absorben líneas hasta equilibrar paréntesis (p.ej. `String(\n x\n)`).
      while (j < fisicas.length) {
        texto += " " + fisicas[j].trim();
        const abiertos = (texto.match(/\(/g) ?? []).length;
        const cerrados = (texto.match(/\)/g) ?? []).length;
        j++;
        if (abiertos <= cerrados) break;
      }
    }
    out.push({ line: i + 1, text: texto });
  }
  return out;
}

/**
 * Líneas que ASIGNAN un valor al campo (`campo: <algo>,`), descartando las
 * formas que no son escritura de datos: `campo: true` de un `select`, `campo:`
 * de un tipo/zod, y las claves de un `where`.
 */
function assignmentLines(src: string, field: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  logicalLines(src).forEach(({ line: n, text }) => {
    const i = n - 1;
    const m = text.match(ASSIGNMENT_LINE);
    if (!m || m[1] !== field) return;
    const value = m[2].trim();
    if (/^(true|false|undefined)\b/.test(value)) return; // select
    if (/^(string|number|boolean)\b/.test(value)) return; // anotación de tipo
    if (/^z\./.test(value)) return; // zod
    out.push({ line: i + 1, text: text.trim() });
  });
  return out;
}

describe("guard: los syncs de proveedor no escriben texto crudo del feed", () => {
  for (const file of SYNC_FILES) {
    const src = read(file);

    for (const field of TEXT_FIELDS) {
      const lines = assignmentLines(src, field);
      if (lines.length === 0) continue; // ese proveedor no aporta ese campo

      it(`${file} — ${field} (${lines.length} asignación/es) pasa por el saneador`, () => {
        const sucias = lines.filter((l) => {
          if (SANITIZER.test(l.text)) return false;
          // Cifra calcula una vez el nombre limpio para reutilizar exactamente
          // el mismo valor en Product.name y en la creación de slugs.
          return !/^name:\s*cleanName,?$/.test(l.text);
        });
        expect(
          sucias.map((l) => `${file}:${l.line}  ${l.text}`),
          `Texto de proveedor sin sanear. Envuelve el valor en sanitizeSupplierText(...) ` +
            `(o sanitizeSupplierName(...) si el campo es NOT NULL).`,
        ).toEqual([]);
      });
    }

    it(`${file} importa el saneador`, () => {
      expect(src).toMatch(/from\s+"\.\/sanitize-supplier-text"/);
    });
  }

  // Anti-falso-verde: si el detector de asignaciones dejara de encontrar nada,
  // el guard pasaría vacío y no protegería de nada.
  it("el guard encuentra asignaciones reales en los 3 syncs (anti-falso-verde)", () => {
    for (const file of SYNC_FILES) {
      const src = read(file);
      const total = TEXT_FIELDS.reduce((n, f) => n + assignmentLines(src, f).length, 0);
      expect(total, `${file}: el guard no detectó ninguna asignación de texto`).toBeGreaterThan(0);
    }
  });

  it("🛡️ el campo `name` se audita en LOS TRES syncs, no vale que falte", () => {
    // El `continue` de arriba salta un campo cuando no encuentra asignaciones,
    // y eso confunde dos cosas muy distintas: "este proveedor no aporta el
    // campo" y "el guard no supo verlo". Para `name` —que es NOT NULL y sale
    // en la ficha, el título y las meta— se exige explícitamente que aparezca.
    for (const file of SYNC_FILES) {
      expect(
        assignmentLines(read(file), "name").length,
        `${file}: el guard no ve ninguna asignación de \`name\`. O el sync dejó de ` +
          `escribirlo, o el detector se quedó ciego — las dos cosas hay que mirarlas.`,
      ).toBeGreaterThan(0);
    }
  });

  describe("🔬 anti-falso-verde del detector — ve las asignaciones PARTIDAS", () => {
    it.each([
      ["en una línea", "  shortDescription: raw.description,"],
      ["partida en dos líneas", "  shortDescription:\n    raw.description,"],
      ["partida con línea en blanco", "  shortDescription:\n\n    raw.description,"],
      ["partida con paréntesis abiertos", "  shortDescription:\n    String(\n      raw.description,\n    ),"],
    ])("ve la asignación %s", (_caso, codigo) => {
      // Antes de 2026-08-10 las tres últimas eran INVISIBLES para el guard.
      expect(assignmentLines(codigo, "shortDescription").length).toBeGreaterThan(0);
    });

    it("sigue descartando lo que no es escritura de datos (select, zod, tipos)", () => {
      expect(assignmentLines("  shortDescription: true,", "shortDescription")).toEqual([]);
      expect(assignmentLines("  shortDescription: z.string(),", "shortDescription")).toEqual([]);
      expect(assignmentLines("  shortDescription: string;", "shortDescription")).toEqual([]);
      expect(assignmentLines("  shortDescription:\n    true,", "shortDescription")).toEqual([]);
    });

    it("🔒 y una asignación partida SIN sanear se marca como sucia", () => {
      // La prueba de que la corrección sirve de algo: el detector no solo la
      // ve, sino que el guard la clasifica como infractora.
      const partidaSucia = assignmentLines("  material:\n    raw.material,", "material");
      expect(partidaSucia.length).toBe(1);
      expect(SANITIZER.test(partidaSucia[0].text)).toBe(false);

      const partidaLimpia = assignmentLines(
        "  material:\n    sanitizeSupplierText(raw.material),",
        "material",
      );
      expect(partidaLimpia.length).toBe(1);
      expect(SANITIZER.test(partidaLimpia[0].text)).toBe(true);
    });
  });

  it.each([
    ["src/lib/suppliers/cifra-sync.ts", /sanitizeSupplierName\(head\.name\)/, 2],
    ["src/lib/suppliers/makito-sync.ts", /sanitizeSupplierName\(String\(p\.name\)\)/, 2],
    ["src/lib/suppliers/midocean-sync.ts", /sanitizeSupplierName\(raw\.product_name\)/, 1],
  ] as const)("%s usa el mismo cleanName saneado para Product.name y slugs nuevos", (
    file,
    sanitizer,
    persistedNames,
  ) => {
    const src = read(file);
    expect(src).toMatch(sanitizer);
    expect(src).toMatch(/resolveCleanProductSlug\(cleanName, existing\?\.id \?\? null\)/);
    expect(src.match(/name:\s*cleanName/g)).toHaveLength(persistedNames);
  });
});
