/**
 * Agrupa las variantes de un producto en OPCIONES DE COLOR, cada una con sus
 * tallas disponibles. Resuelve dos rarezas del catálogo real:
 *
 *  1. Las variantes vienen como producto cartesiano color×talla (una fila por
 *     combinación), así que hay que deduplicar por color para los swatches.
 *  2. Muchos productos (sobre todo textil Sol's/proveedor) traen el campo
 *     `size` VACÍO y la talla embebida en el SKU (`S17000-BF-3XL` → 3XL). Se
 *     extrae de `size` si existe, y si no del sufijo del SKU validado contra
 *     una lista de tallas conocidas. Si no se reconoce, el color no tiene
 *     tallas (p.ej. una botella en 5 colores) y se elige por variante directa.
 */

const KNOWN_SIZES = [
  "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL",
  "3XL", "4XL", "5XL", "6XL", "7XL", "8XL",
];
const SIZE_RANK = new Map(KNOWN_SIZES.map((s, i) => [s, i]));

export type VariantInput = {
  id: string;
  sku: string;
  colorName: string | null;
  colorGroup: string | null;
  colorHex?: string | null;
  size: string | null;
  imageUrl: string | null;
  stockQty: number;
};

export type SizeOption = {
  size: string;
  sku: string;
  stockQty: number;
};

export type ColorOption = {
  /** Identificador estable del color (colorName normalizado, o sku si no hay nombre). */
  key: string;
  colorName: string | null;
  /** Hex del color (si el proveedor lo da) — fallback visual cuando no hay foto. */
  colorHex: string | null;
  imageUrl: string | null;
  /** Tallas de este color, ordenadas. Vacío si el color no tiene tallas. */
  sizes: SizeOption[];
  /** SKU a usar cuando el color no tiene tallas (variante única del color). */
  primarySku: string;
  totalStock: number;
};

/**
 * Talla de una variante. Prioridad:
 *  1. Campo `size` si viene relleno (Makito lo rellena: S/M/L, 38, 40…). Fiable.
 *  2. Si no, el sufijo del SKU PERO SOLO si es una talla ALFABÉTICA conocida
 *     (S…6XL). Los sufijos NUMÉRICOS del SKU son códigos de COLOR en varios
 *     proveedores (MidOcean `MO9268-03`, no talla), así que NUNCA los tratamos
 *     como talla — evita tallas fantasma. Las tallas numéricas reales (calzado)
 *     llegan por el campo `size`, no por el SKU.
 */
export function extractSize(v: { size: string | null; sku: string }): string | null {
  if (v.size && v.size.trim()) return v.size.trim().toUpperCase();
  const seg = (v.sku.split("-").pop() ?? "").toUpperCase();
  return SIZE_RANK.has(seg) ? seg : null;
}

function sizeSort(a: SizeOption, b: SizeOption): number {
  const ra = SIZE_RANK.get(a.size);
  const rb = SIZE_RANK.get(b.size);
  if (ra != null && rb != null) return ra - rb;
  if (ra != null) return -1;
  if (rb != null) return 1;
  const na = parseFloat(a.size);
  const nb = parseFloat(b.size);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.size.localeCompare(b.size);
}

/**
 * Agrupa por color (colorName). Devuelve una opción por color único, cada una
 * con sus tallas ordenadas. Mantiene el orden de primera aparición de colores.
 */
export function groupColorOptions(variants: VariantInput[]): ColorOption[] {
  const byColor = new Map<string, ColorOption>();

  for (const v of variants) {
    if (!v.colorName) continue;
    const key = v.colorName.trim().toLowerCase();
    let opt = byColor.get(key);
    if (!opt) {
      opt = {
        key,
        colorName: v.colorName,
        colorHex: v.colorHex ?? null,
        imageUrl: v.imageUrl,
        sizes: [],
        primarySku: v.sku,
        totalStock: 0,
      };
      byColor.set(key, opt);
    }
    // La imagen/hex del color: primer valor no nulo que aparezca
    if (!opt.imageUrl && v.imageUrl) opt.imageUrl = v.imageUrl;
    if (!opt.colorHex && v.colorHex) opt.colorHex = v.colorHex;
    opt.totalStock += v.stockQty ?? 0;

    const size = extractSize(v);
    if (size) {
      // Evitar tallas duplicadas dentro del mismo color (nos quedamos con la
      // de más stock si se repite el par color+talla).
      const existing = opt.sizes.find((s) => s.size === size);
      if (!existing) {
        opt.sizes.push({ size, sku: v.sku, stockQty: v.stockQty ?? 0 });
      } else if ((v.stockQty ?? 0) > existing.stockQty) {
        existing.sku = v.sku;
        existing.stockQty = v.stockQty ?? 0;
      }
    }
  }

  const options = [...byColor.values()];
  for (const opt of options) opt.sizes.sort(sizeSort);
  return options;
}

/**
 * Familia de color canónica (minúsculas) a partir de un nombre de color en
 * texto libre. Sirve para el FILTRO de color del catálogo: MidOcean y Cifra
 * traen `color_group`/`group` del feed, pero Makito NO (lo dejaba a null) y
 * Cifra falla cuando el sufijo no está en su diccionario → el 64% del catálogo
 * quedaba fuera del filtro. Deriva el grupo por palabras clave del nombre.
 *
 * Devuelve null si el "color" es en realidad ruido (forma/figura navideña,
 * "s/c" sin color) para no ensuciar las facetas del filtro. Los nombres
 * compuestos ("azul marino", "verde botella") caen en su familia base.
 */
const COLOR_GROUP_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Combinaciones "blanco/rojo", "azul/blanco" → multicolor (antes que nada).
  [/^[a-z]+\/[a-z]/, "multicolor"],
  [/\b(multicolor|rainbow|arco ?iris|surtido|varios|mix)\b/, "multicolor"],
  // Familias. Orden: variantes que colisionarían (marino→azul) van con su base.
  [/\b(marino|azul|turquesa|celeste|cian|royal|denim|cobalto)\b/, "azul"],
  [/\b(verde|kaki|caqui|lima|menta|oliva|militar|botella|pistacho)\b/, "verde"],
  [/\b(rojo|roja|granate|burdeos|carmes[ií]|teja|bermell[oó]n)\b/, "rojo"],
  [/\b(rosa|fucsia|magenta|salm[oó]n|fresa|sand[ií]a|coral|frambuesa|chicle|palo de rosa)\b/, "rosa"],
  [/\b(naranja|mandarina|calabaza|teja)\b/, "naranja"],
  [/\b(morado|violeta|lila|p[uú]rpura|purple|malva|berenjena)\b/, "morado"],
  [/\b(marr[oó]n|chocolate|caf[eé]|caramelo|tostado|camel|cobre|teja oscura)\b/, "marron"],
  [/\b(dorado|dorada|oro|gold)\b/, "dorado"],
  [/\b(amarillo|amarilla|lim[oó]n|mostaza|fluor amarillo)\b/, "amarillo"],
  [/\b(gris|plata|plateado|plateada|antracita|marengo)\b/, "gris"],
  [/\b(beige|beig|arena|natural|nude|crema|tierra|hueso|marfil|crudo)\b/, "beige"],
  [/\b(negro|negra)\b/, "negro"],
  [/\b(blanco|blanca)\b/, "blanco"],
  [/\b(transparente|trasl[uú]cido|cristal|incoloro)\b/, "transparente"],
];

/** Tokens que NO son colores (formas, figuras, "sin color") → sin grupo. */
const NON_COLOR = new Set([
  "s/c", "s/t", "n/a", "na", "sin color", "surtir",
  "circular", "cuadrado", "rectangulo", "rectángulo", "ovalado",
  "arbol", "árbol", "estrella", "gato", "reno", "papa noel", "sandia",
  "corazon", "corazón", "españa", "spain", "flor",
]);

export function colorGroupFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const raw = name.trim().toLowerCase();
  if (!raw) return null;
  if (NON_COLOR.has(raw)) return null;
  // Normaliza acentos para el matching por palabra clave.
  const norm = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [re, group] of COLOR_GROUP_RULES) {
    if (re.test(norm)) return group;
  }
  return null;
}

/**
 * Canonicaliza un grupo de color que YA viene del proveedor (MidOcean
 * `color_group` = "Azul"/"Marr\u00f3n"/"Purple"/"Oro"; dict de Cifra = "marr\u00f3n"/
 * "lila") al MISMO vocabulario que {@link colorGroupFromName}: min\u00fasculas y sin
 * acentos. Imprescindible porque el filtro de color agrupa con
 * `groupBy(colorGroup)` sobre el string EXACTO y Postgres no pliega acentos ni
 * con `mode:"insensitive"` \u2192 sin esto conviven "Marr\u00f3n", "marr\u00f3n" y "marron"
 * como TRES facetas del mismo color y el filtro parte el cat\u00e1logo.
 *
 * Primero intenta mapear a familia conocida (traduce "Purple"\u2192morado,
 * "Oro"\u2192dorado, "Mix ES"\u2192multicolor\u2026). Si no la reconoce, devuelve el token
 * normalizado (min\u00fasculas, sin acentos): nunca pierde el agrupamiento que ya
 * tra\u00eda el proveedor, solo unifica caja y acentos.
 */
export function canonicalColorGroup(group: string | null | undefined): string | null {
  if (!group) return null;
  const known = colorGroupFromName(group);
  if (known) return known;
  const norm = group
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return norm || null;
}
