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

import { legacyHtmlToText, normalizeProductName } from "@/lib/product-name";

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

/**
 * Argumentario MAYORISTA: el catálogo del proveedor está escrito para su
 * cliente, que es el distribuidor, no para el cliente final.
 *
 * Las 63 fichas de gran formato servían literalmente «Exclusivamente para
 * Rotulistas y Distribuidores ✓ 100% Online ✓ Fabricación y entrega en 24h
 * 【30% de margen】Envío gratis.» — es decir, le decían al cliente que ese
 * producto no es para él y cuánto gana Startidea revendiéndoselo.
 *
 * Se borra la FRASE entera, no la palabra suelta: dejar «✓ 100% Online ✓
 * Fabricación y entrega en 24h» descolgado es tan raro como no borrar nada.
 */
const MAYORISTA_RES: RegExp[] = [
  // "【30% de margen】", "(30 % de margen)", "30% de margen"
  /[【(\[]?\s*\d{1,3}\s*%\s*de\s*margen\s*[】)\]]?/gi,
  // "margen comercial del 30 %", "margen para el distribuidor"
  /\bmargen(?:\s+comercial)?(?:\s+(?:del?|para)\s+[^.·✓|]{0,40})?/gi,
  // "Exclusivamente para Rotulistas y Distribuidores" y variantes
  /\b(?:exclusivamente\s+)?(?:para\s+)?rotulistas?(?:\s+y\s+distribuidores?)?/gi,
  /\bexclusivamente\s+para\s+(?:profesionales|distribuidores?|mayoristas?)[^.·✓|]{0,30}/gi,
  /\b(?:solo|sólo)\s+(?:para\s+)?(?:distribuidores?|mayoristas?|profesionales\s+del\s+sector)/gi,
  // Precio/tarifa que no es la del cliente final
  /\bpvp\s+(?:recomendado|sugerido)/gi,
  /\bprecios?\s+(?:de\s+)?(?:distribuidor(?:es)?|mayorista|de\s+coste|neto\s+de\s+distribuidor)/gi,
  /\btarifa\s+(?:de\s+)?(?:distribuidor(?:es)?|mayorista)/gi,
  /\bventa\s+al\s+por\s+mayor\b/gi,
  /\b(?:precio|catálogo|zona|área)\s+mayorista\b/gi,
];

/** Restos tipográficos que deja el borrado: "()", " ,", espacios dobles. */
function tidy(s: string): string {
  return s
    .replace(/\(\s*\)/g, " ")
    .replace(/\[\s*\]/g, " ")
    .replace(/【\s*】/g, " ")
    // Un "✓" sin nada detrás es el resto de una ventaja borrada.
    .replace(/✓\s*(?=✓|[.·|]|$)/g, " ")
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
  const raw = legacyHtmlToText(value);
  if (!raw) return null;

  let limpio = raw
    .replace(EMAIL_RE, " ")
    .replace(URL_RE, " ")
    .replace(SUPPLIER_BRAND_RE, " ")
    .replace(CIFRA_BRAND_RE, " ");
  for (const re of MAYORISTA_RES) limpio = limpio.replace(re, " ");

  const cleaned = tidy(limpio);

  return isEmptyish(cleaned) ? null : cleaned;
}

/**
 * Variante para `Product.name`, que es NOT NULL: si el saneado de proveedor
 * dejara el nombre vacío se conserva el nombre ya convertido a texto plano.
 * Si el feed no trae ningún nombre útil, usa el fallback estable "Producto".
 */
export function sanitizeSupplierName(value: string | null | undefined): string {
  const fallback = normalizeProductName(value);
  return sanitizeSupplierText(fallback) ?? fallback;
}

/**
 * Devuelve los trozos de argumentario mayorista que hay en un texto.
 *
 * Es la comprobación de SALIDA del saneador: se usa en los importadores para
 * que un patrón nuevo del proveedor no se cuele en silencio. El criterio del
 * encargo es explícito: esto tiene que **romper el import**, no limpiarse sin
 * que nadie se entere.
 */
export function supplierJargonHits(value: string | null | undefined): string[] {
  if (!value) return [];
  const hits: string[] = [];
  for (const re of MAYORISTA_RES) {
    const found = value.match(new RegExp(re.source, re.flags));
    if (found) hits.push(...found.map((h) => h.trim()).filter(Boolean));
  }
  return hits;
}

/** Lanza si en un campo que va a la ficha pública queda jerga de mayorista. */
export function assertNoSupplierJargon(value: string | null | undefined, contexto: string): void {
  const hits = supplierJargonHits(value);
  if (hits.length === 0) return;
  throw new Error(
    `Texto de mayorista en ${contexto}: ${hits.map((h) => `«${h}»`).join(", ")}. ` +
      `Añade el patrón a MAYORISTA_RES en sanitize-supplier-text.ts — no lo escribas en la ficha.`,
  );
}
