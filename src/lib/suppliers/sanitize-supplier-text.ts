/**
 * Saneador de texto libre que llega de los feeds de proveedor.
 *
 * Los feeds cuelan notas internas del proveedor en campos que acaban en la web
 * pública: el 28-jul-2026 cinco fichas servían "…consultar con el departamento
 * de marcaje produccion@cifra.es" dentro de la `meta description`, la
 * `og:description` y el HTML — indexable por Google y una invitación directa a
 * saltarse a Startidea. Se saneó en BD, pero el mapper del sync lo reescribía en
 * cada corrida: el arreglo duradero es sanear AL IMPORTAR.
 *
 * Es la versión "de entrada" del blindaje que ya existe para imágenes
 * (`proxy-image.ts` + el guard `no-raw-provider-image.guard.test.ts`).
 *
 * Criterio deliberadamente CONSERVADOR: solo se borra lo inequívoco. Un falso
 * positivo aquí mutila la descripción de un producto que se vende, así que
 * "cifra" a secas NO se toca (es palabra corriente en español) y "adivin" solo
 * se borra como palabra exacta, nunca "adivina"/"adivinar".
 */

/** Ningún email tiene por qué viajar en un campo público de catálogo. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Cualquier URL de un feed de proveedor apunta al proveedor (su web, su CDN, su
 * PDF de tarifas). No hay URL legítima que deba salir del feed a la ficha.
 */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;

/** Marcas de proveedor sin ambigüedad en castellano. */
const SUPPLIER_BRAND_RE = /\b(?:mid[\s-]?ocean|makito|adivin)\b/gi;

/**
 * "Cifra" sola es sustantivo común ("una cifra de negocio"), así que solo se
 * borra cuando aparece en forma de marca o de dominio.
 */
const CIFRA_BRAND_RE = /\b(?:cifra\.es|cifra[\s-]+merchandising|grupo[\s-]+cifra)\b/gi;

/** Restos tipográficos que deja el borrado: "()", " ,", espacios dobles. */
function tidy(s: string): string {
  return s
    .replace(/\(\s*\)/g, " ")
    .replace(/\[\s*\]/g, " ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:·-])\s*$/g, "")
    .replace(/^\s*[,.;:·-]\s*/g, "")
    .trim();
}

/** true si tras sanear no queda nada con contenido (solo signos o espacios). */
function isEmptyish(s: string): boolean {
  return !/[\p{L}\p{N}]/u.test(s);
}

/**
 * Limpia un campo de texto OPCIONAL venido del feed.
 * Devuelve `null` cuando el campo queda vacío — así el campo desaparece de la
 * ficha en vez de mostrar una frase mutilada.
 */
export function sanitizeSupplierText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value);
  if (!raw.trim()) return null;

  const cleaned = tidy(
    raw
      .replace(EMAIL_RE, " ")
      .replace(URL_RE, " ")
      .replace(SUPPLIER_BRAND_RE, " ")
      .replace(CIFRA_BRAND_RE, " "),
  );

  return isEmptyish(cleaned) ? null : cleaned;
}

/**
 * Variante para `Product.name`, que es NOT NULL: si el saneado dejara el nombre
 * vacío se conserva el original recortado. Un producto sin nombre rompe la ficha
 * y el buscador, y ese daño es peor que el caso —teórico— de un nombre que sea
 * literalmente la marca del proveedor y nada más.
 */
export function sanitizeSupplierName(value: string | null | undefined): string {
  const fallback = String(value ?? "").trim();
  return sanitizeSupplierText(value) ?? fallback;
}
