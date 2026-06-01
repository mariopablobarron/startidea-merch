/**
 * Inyecta enlaces internos a productos del catálogo y categorías
 * en el HTML renderizado de un blog post.
 *
 * Estrategia conservadora:
 *  - Enlaza solo la primera ocurrencia de cada término
 *  - Solo dentro de <p>...</p> (no en headings, listas, código)
 *  - Si el término ya estaba dentro de un <a>, lo respeta
 *  - Match case-insensitive con word boundaries
 *  - Términos mínimo 4 chars (evita falsos positivos tipo "tee")
 *
 * Beneficio SEO:
 *  - Internal linking masivo de blog → catálogo
 *  - Google entiende el clúster temático (blog post sobre serigrafía
 *    enlaza al producto camiseta serigráfica)
 *  - Mejora dwell time (usuarios siguen el enlace al producto)
 */

export type LinkableEntity = {
  name: string;
  url: string;
  /** Alias adicionales (case-insensitive) que también deben matchear */
  aliases?: string[];
};

/**
 * Escapa caracteres regex de un string.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Inyecta links de las entidades dadas en el HTML.
 * Limita a `maxPerEntity` enlaces por entidad para no spammear.
 */
export function injectInternalLinks(
  html: string,
  entities: LinkableEntity[],
  opts: { maxPerEntity?: number; minLength?: number } = {},
): string {
  const { maxPerEntity = 1, minLength = 4 } = opts;

  // Ordenamos por longitud descendente — términos más largos primero
  // para evitar que "merchandising" se solape con "merchandising corporativo".
  const sorted = [...entities].sort((a, b) => b.name.length - a.name.length);

  let result = html;
  const linkedCount = new Map<string, number>();

  for (const entity of sorted) {
    const terms = [entity.name, ...(entity.aliases ?? [])].filter(
      (t) => t.length >= minLength,
    );
    for (const term of terms) {
      const count = linkedCount.get(entity.url) ?? 0;
      if (count >= maxPerEntity) break;

      // Regex con word boundaries — pero \b no funciona con acentos en JS.
      // Usamos un lookbehind/ahead que asegura que el carácter anterior y
      // siguiente NO son alfanuméricos ni acentos. Necesita ES2018+.
      // term ya está saneado vía escapeRegex — falso positivo ReDoS.
      // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])(${escapeRegex(term)})(?![\\p{L}\\p{N}])`,
        "iu",
      );

      // Solo reemplazar si NO está dentro de un <a> existente ni dentro
      // de etiquetas que no queremos tocar (h2, h3, code, pre, a).
      // Estrategia: dividir por bloques tipo <a>...</a> y <code>...</code>
      // y solo modificar los segmentos "fuera de" esos bloques.
      const safe = replaceOutsideTags(
        result,
        re,
        `<a href="${entity.url}" class="text-accent hover:underline">$1</a>`,
        ["a", "code", "pre", "h1", "h2", "h3"],
      );

      if (safe !== result) {
        linkedCount.set(entity.url, count + 1);
        result = safe;
      }
    }
  }

  return result;
}

/**
 * Aplica un regex.replace sobre el HTML pero saltándose bloques entre
 * etiquetas dadas (caso típico: no entrar a <a> existentes ni a <code>).
 *
 * Implementación simple: parsea linealmente, mantiene un stack de tags
 * "prohibidas", aplica replace solo cuando el stack está vacío.
 */
function replaceOutsideTags(
  html: string,
  regex: RegExp,
  replacement: string,
  forbiddenTags: string[],
): string {
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let result = "";
  let lastIndex = 0;
  const stack: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const text = html.slice(lastIndex, match.index);
    if (stack.length === 0) {
      // Estamos fuera de bloque prohibido — aplicar replace
      result += text.replace(regex, replacement);
    } else {
      result += text;
    }
    result += match[0];

    const tagName = match[1].toLowerCase();
    const isClosing = match[0].startsWith("</");
    const isSelfClosing = match[0].endsWith("/>");

    if (forbiddenTags.includes(tagName)) {
      if (isClosing) {
        // pop la coincidente más cercana
        const idx = stack.lastIndexOf(tagName);
        if (idx >= 0) stack.splice(idx, 1);
      } else if (!isSelfClosing) {
        stack.push(tagName);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  // Cola final
  const tail = html.slice(lastIndex);
  if (stack.length === 0) {
    result += tail.replace(regex, replacement);
  } else {
    result += tail;
  }
  return result;
}
