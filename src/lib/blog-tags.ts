/**
 * Helpers para normalizar tags del blog a slugs URL-friendly y viceversa.
 *
 * Tag "compras públicas" → slug "compras-publicas"
 * Tag "RRHH" → slug "rrhh"
 *
 * En BD el tag se guarda con su forma original (con mayúsculas, acentos, espacios).
 * En URL usamos la versión slugified.
 */

/**
 * Convierte un tag a slug URL-friendly.
 */
export function tagToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos
    .replace(/[^a-z0-9\s-]/g, "") // solo alphanumeric + espacios + guiones
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Capitaliza un slug para display.
 * Si el slug coincide con un nombre conocido (RRHH, RSC), lo mantiene.
 */
export function slugToDisplayTag(slug: string, originals: string[] = []): string {
  // Si el slug coincide con la forma slugified de algún original, devuelve el original
  for (const orig of originals) {
    if (tagToSlug(orig) === slug) return orig;
  }
  // Fallback: capitalizar y quitar guiones
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
