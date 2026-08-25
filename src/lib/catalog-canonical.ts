/**
 * Canonical del listado /catalogo, decidido a partir de sus query params.
 *
 * Hasta el 26-ago-2026 las ~400 páginas de la serie (9.6xx productos / 24 por
 * página) canonicalizaban TODAS a /catalogo: le decían a Google que la página 2
 * era la página 1. Google desaconseja explícitamente colapsar una serie
 * paginada sobre su primera página — los enlaces que solo viven en la página 37
 * dejan de contar. (Las fichas no desaparecían del índice: las 9.619 están en
 * el sitemap. Lo que se perdía era esa vía de rastreo y el peso interno.)
 *
 * La regla, en una frase: **se autorreferencia la serie limpia; las vistas
 * facetadas siguen consolidando.**
 *
 * - `/catalogo` → sí mismo.
 * - `/catalogo?page=3` → sí mismo (antes: /catalogo).
 * - `/catalogo?cat=textil` → la landing limpia /categorias/textil, como siempre.
 * - `/catalogo?cat=textil&page=3` → sí mismo: la landing de categoría no pagina,
 *   así que apuntar ahí escondería justo los productos de esa página.
 * - `/catalogo?color=rojo&page=3` → /catalogo. Una faceta no es una serie:
 *   hacerla canónica sembraría el índice de duplicados combinatorios.
 *
 * Vive fuera de la página a propósito: así la decisión se prueba con sus casos
 * en vez de deducirse leyendo un `generateMetadata` que necesita BD para correr.
 */

export type CatalogoSearchParams = {
  cat?: string;
  page?: string;
  q?: string;
  color?: string;
  talla?: string;
  mat?: string;
  sort?: string;
};

/** Filtros que hacen de la vista una faceta y no un tramo de la serie. */
const FACETAS = ["q", "color", "talla", "mat", "sort"] as const;

export function hasFacets(sp: CatalogoSearchParams): boolean {
  return FACETAS.some((k) => (sp[k] || "").trim().length > 0);
}

/**
 * Número de página normalizado. Todo lo que no sea un entero > 1 es la página
 * 1: "0", "-2", "abc", "2.7" y "" son la primera página, no una serie.
 */
export function pageNumber(raw: string | undefined): number {
  const trimmed = (raw || "").trim();
  if (!/^\d+$/.test(trimmed)) return 1;
  const n = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(n) && n > 1 ? n : 1;
}

export function catalogCanonical(
  sp: CatalogoSearchParams,
  siteUrl: string,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const cat = (sp.cat || "").trim();
  const page = pageNumber(sp.page);

  if (page > 1 && !hasFacets(sp)) {
    const query = new URLSearchParams();
    if (cat) query.set("cat", cat);
    query.set("page", String(page));
    return `${base}/catalogo?${query.toString()}`;
  }

  // Vista filtrada por categoría → canonical a la landing limpia, para
  // consolidar autoridad y evitar contenido duplicado por query params.
  if (cat) return `${base}/categorias/${cat}`;

  return `${base}/catalogo`;
}
