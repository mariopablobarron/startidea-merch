import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard POR DESCUBRIMIENTO: ningún listado paginado se canonicaliza entero
 * sobre su primera página.
 *
 * Medido en producción el 26-ago-2026: `/catalogo?page=2` servía
 * `canonical = /catalogo`, y con él las ~400 páginas de la serie (9.6xx
 * productos / 24). Su `generateMetadata` leía `cat` y no leía `page`, así que
 * toda la serie heredaba el canonical fijo del metadata base.
 *
 * La regla del repo, escrita ahora que existe el caso:
 *
 *   toda página pública que pagine (lee `page` en sus `searchParams`) decide su
 *   canonical mirando esa página — o declarando `page` en el `generateMetadata`,
 *   o delegando en un helper que lo haga (`catalogCanonical`).
 *
 * No es una lista blanca de los listados de hoy: recorre `src/app` entero, así
 * que un listado paginado nuevo que se olvide falla aquí. Se excluyen /admin y
 * /api: no se indexan (robots.txt los bloquea) y no tienen canonical que
 * proteger.
 */

const APP_DIR = join(process.cwd(), "src/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** ¿El componente de esta página acepta un `page` por query string? */
export function pagina(source: string): boolean {
  // `page?: string` dentro de la firma de searchParams, o el tipo compartido
  // que lo declara por ella.
  return (
    /\bpage\?\s*:\s*string/.test(source) ||
    /\bCatalogoSearchParams\b/.test(source)
  );
}

/**
 * ¿El canonical que produce su `generateMetadata` depende de la página?
 *
 * Se mira el VALOR asignado al canonical, no si la función nombra la página en
 * algún sitio. La primera versión de este detector se conformaba con lo
 * segundo, y una mutación lo destapó: al devolver /catalogo la página seguía
 * llamando a `pageNumber(sp.page)` — para el título — así que el guard daba
 * verde sobre el defecto exacto que existe para vigilar.
 */
export function canonicalConsciente(source: string): boolean {
  const at = source.indexOf("generateMetadata");
  if (at === -1) return false;
  const desde = source.slice(at);
  // Recorta hasta la siguiente declaración de primer nivel. Una versión previa
  // cortaba en el primer `\n}\n` y, con la función indentada, ese `indexOf`
  // devolvía -1: con el `+ 3` se quedaba en DOS caracteres. Es uno de los
  // casos de abajo.
  const fin = desde.search(/\n(export |const |function |type |async function )/);
  const cuerpo = fin === -1 ? desde : desde.slice(0, fin);

  // Cada valor que se le da al canonical dentro del cuerpo.
  const valores = [...cuerpo.matchAll(/(?:const\s+canonical\s*=|canonical\s*:)\s*([^;\n]+)/g)]
    .map((m) => m[1]);
  if (valores.length === 0) return false;

  return valores.some((v) => /\bcatalogCanonical\b|\bpage\b/i.test(v));
}

const listados = walk(APP_DIR)
  .filter((f) => /\/page\.tsx$/.test(f))
  .filter((f) => !f.includes("/admin/") && !f.includes("/api/"))
  .map((f) => ({ file: relative(process.cwd(), f), source: readFileSync(f, "utf8") }))
  .filter((p) => pagina(p.source));

describe("guard: canonical en listados paginados", () => {
  it("descubre de verdad los listados públicos que paginan", () => {
    // Sin cobertura, el guard de abajo pasaría verde sobre una lista vacía —
    // que es justo lo que pasaría si alguien renombra el parámetro.
    expect(listados.length).toBeGreaterThanOrEqual(1);
    expect(listados.map((l) => l.file)).toContain("src/app/catalogo/page.tsx");
  });

  it("ninguno colapsa la serie sobre su primera página", () => {
    const colapsan = listados
      .filter((l) => !canonicalConsciente(l.source))
      .map((l) => l.file);

    expect(colapsan).toEqual([]);
  });

  it("los detectores distinguen de verdad", () => {
    // Detectores siempre-true dejarían pasar cualquier cosa: se prueban contra
    // fuentes sintéticas antes de fiarse de ellos.
    expect(pagina(`searchParams: Promise<{ cat?: string; page?: string }>`)).toBe(true);
    expect(pagina(`searchParams: Promise<{ cat?: string }>`)).toBe(false);
    // Un texto cualquiera con la palabra "page" no es paginar.
    expect(pagina(`const pageTitle = "x"; // page`)).toBe(false);

    const consciente = `export async function generateMetadata({ searchParams }) {
      const sp = await searchParams;
      const canonical = catalogCanonical(sp, SITE_URL);
      return { alternates: { canonical } };
    }
    `;
    const ciego = `export async function generateMetadata({ searchParams }) {
      const cat = (await searchParams).cat;
      const canonical = SITE_URL + "/catalogo";
      return { alternates: { canonical } };
    }
    `;
    expect(canonicalConsciente(consciente)).toBe(true);
    expect(canonicalConsciente(ciego)).toBe(false);

    // EL CASO QUE SE ESCAPÓ: canonical fijo, pero la función sí nombra la
    // página porque la usa para el título. Un detector que mire el fichero en
    // vez del valor del canonical da verde sobre el defecto que vigila.
    const ciegoQueNombraLaPagina = `export async function generateMetadata({ searchParams }) {
      const sp = await searchParams;
      const page = pageNumber(sp.page);
      const canonical = \`\${SITE_URL}/catalogo\`;
      return { title: page > 1 ? \`x — página \${page}\` : "x", alternates: { canonical } };
    }
    `;
    expect(canonicalConsciente(ciegoQueNombraLaPagina)).toBe(false);

    // Sin generateMetadata no hay canonical propio que mirar.
    expect(canonicalConsciente(`export default function P() { return null }`)).toBe(false);
    // Con generateMetadata pero sin canonical ninguno: tampoco pasa.
    expect(
      canonicalConsciente(`export async function generateMetadata() { return { title: "x" } }`),
    ).toBe(false);
    // Indentado y sin declaración detrás: el recorte anterior lo daba por ciego.
    expect(canonicalConsciente(consciente.replace(/\n/g, "\n  "))).toBe(true);
    // Y no confundirse con un generateMetadata ciego seguido de OTRA función
    // que sí usa el helper: lo que cuenta es el cuerpo, no el fichero.
    const ciegoConVecinoConsciente = `${ciego}\nexport const otra = () => catalogCanonical(sp, SITE_URL);\n`;
    expect(canonicalConsciente(ciegoConVecinoConsciente)).toBe(false);
  });
});
