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

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * Líneas que ASIGNAN un valor al campo (`campo: <algo>,`), descartando las
 * formas que no son escritura de datos: `campo: true` de un `select`, `campo:`
 * de un tipo/zod, y las claves de un `where`.
 */
function assignmentLines(src: string, field: string): { line: number; text: string }[] {
  const re = new RegExp(`^\\s*${field}\\s*:\\s*(.+?),?\\s*$`);
  const out: { line: number; text: string }[] = [];
  src.split("\n").forEach((text, i) => {
    const m = text.match(re);
    if (!m) return;
    const value = m[1].trim();
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
        const sucias = lines.filter((l) => !SANITIZER.test(l.text));
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
});
