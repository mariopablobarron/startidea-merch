import { decodeHTML } from "entities";

const DEFAULT_PRODUCT_NAME = "Producto";
const MAX_NORMALIZATION_PASSES = 8;
const NON_VISIBLE_ELEMENTS = new Set(["script", "style", "template", "noscript"]);

function findTagEnd(value: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function asciiTagNameAt(value: string, start: number, tagName: string): boolean {
  if (start + tagName.length > value.length) return false;
  for (let offset = 0; offset < tagName.length; offset += 1) {
    const code = value.charCodeAt(start + offset);
    const folded = code >= 65 && code <= 90 ? code + 32 : code;
    if (folded !== tagName.charCodeAt(offset)) return false;
  }
  return /[\s/>]/.test(value[start + tagName.length] ?? "");
}

function findClosingTag(value: string, tagName: string, from: number): number {
  let cursor = from;
  while (cursor < value.length) {
    const candidate = value.indexOf("<", cursor);
    if (candidate === -1) return -1;
    if (
      value[candidate + 1] === "/" &&
      asciiTagNameAt(value, candidate + 2, tagName)
    ) {
      return candidate;
    }
    cursor = candidate + 1;
  }
  return -1;
}

/**
 * Scanner lineal consciente de comillas. Una regex `[^>]*` cortaba la etiqueta
 * en atributos como `title="1 > 0"` y publicaba restos del atributo.
 */
function stripHtmlMarkup(value: string): string {
  const out: string[] = [];
  let index = 0;

  while (index < value.length) {
    if (value[index] !== "<") {
      out.push(value[index]);
      index += 1;
      continue;
    }

    if (value.startsWith("<!--", index)) {
      const commentEnd = value.indexOf("-->", index + 4);
      out.push(" ");
      index = commentEnd === -1 ? value.length : commentEnd + 3;
      continue;
    }

    let cursor = index + 1;
    if (value[cursor] === "/") cursor += 1;
    const specialTag = value[cursor] === "!" || value[cursor] === "?";
    const tagStart = specialTag || /[A-Za-z]/.test(value[cursor] ?? "");
    if (!tagStart) {
      out.push("<");
      index += 1;
      continue;
    }

    const tagEnd = findTagEnd(value, cursor + 1);
    if (tagEnd === -1) {
      // Parece una etiqueta truncada: no publicar sus atributos incompletos.
      out.push(" ");
      break;
    }

    const nameMatch = value.slice(cursor, tagEnd).match(/^([A-Za-z][\w:-]*)/);
    const tagName = nameMatch?.[1]?.toLowerCase();
    const isClosing = value[index + 1] === "/";
    if (!isClosing && tagName && NON_VISIBLE_ELEMENTS.has(tagName)) {
      const closingStart = findClosingTag(value, tagName, tagEnd + 1);
      if (closingStart === -1) {
        out.push(" ");
        break;
      }
      const closingEnd = findTagEnd(value, closingStart + tagName.length + 2);
      out.push(" ");
      index = closingEnd === -1 ? value.length : closingEnd + 1;
      continue;
    }

    out.push(" ");
    index = tagEnd + 1;
  }

  return out.join("");
}

/**
 * Convierte HTML legado de los feeds en texto plano.
 *
 * Alterna stripping y decodificación para cubrir registros múltiplemente
 * codificados sin convertir `&quot;`/`&apos;` dentro de atributos en cierres
 * sintácticos antes de parsear la etiqueta. El límite evita trabajo ilimitado.
 */
export function legacyHtmlToText(value: string | null | undefined): string {
  if (value == null) return "";

  let normalized = String(value);
  for (let pass = 0; pass < MAX_NORMALIZATION_PASSES; pass += 1) {
    const next = decodeHTML(stripHtmlMarkup(normalized));
    if (next === normalized) break;
    normalized = next;
  }

  return stripHtmlMarkup(normalized)
    .replace(/[\u0000-\u001f\u007f\u00a0\u200b-\u200d\ufeff]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Agrupa representaciones raw distintas que producen el mismo texto visible. */
export function groupLegacyHtmlValues(
  values: ReadonlyArray<string | null | undefined>,
): Array<{ label: string; values: string[] }> {
  const groups = new Map<string, { label: string; values: string[] }>();
  for (const raw of values) {
    if (!raw) continue;
    const label = legacyHtmlToText(raw);
    if (!label) continue;
    const key = label.toLocaleLowerCase("es");
    const group = groups.get(key) ?? { label, values: [] };
    if (!group.values.includes(raw)) group.values.push(raw);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

/** Devuelve siempre un nombre público no vacío y sin markup heredado. */
export function normalizeProductName(
  value: string | null | undefined,
  fallback: string | null | undefined = DEFAULT_PRODUCT_NAME,
): string {
  return legacyHtmlToText(value) || legacyHtmlToText(fallback) || DEFAULT_PRODUCT_NAME;
}

/**
 * Resuelve el override admin y el nombre base con la misma garantía de texto
 * plano. Un override vacío o compuesto solo por tags cae al nombre del feed.
 */
export function publicProductName(
  baseName: string | null | undefined,
  customName?: string | null,
): string {
  return normalizeProductName(customName, normalizeProductName(baseName));
}
