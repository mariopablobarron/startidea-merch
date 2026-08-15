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

export type VariantQuantityLine = SizeOption & { quantity: number };

/** Tallas que el cliente puede elegir según la convención de stock del catálogo. */
export function selectableSizesForOption(option: ColorOption): SizeOption[] {
  return option.sizes.some((size) => size.stockQty > 0)
    ? option.sizes.filter((size) => size.stockQty > 0)
    : option.sizes;
}

/** Cantidades positivas que pertenecen exclusivamente al color/talla actual. */
export function currentVariantQuantityLines(
  sizes: ReadonlyArray<SizeOption>,
  quantities: Readonly<Record<string, number>>,
): VariantQuantityLine[] {
  return sizes
    .map((size) => ({ ...size, quantity: quantities[size.sku] ?? 0 }))
    .filter((line) => line.quantity > 0);
}

export type ColorOption = {
  /** Identificador estable del color; las variantes sin color comparten un grupo neutro. */
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
  /** Número de filas de variante que contiene la opción. */
  variantCount: number;
  /** Filas sin talla dentro de la opción. */
  untaggedVariantCount: number;
  /** Hay varios SKU que la interfaz no puede distinguir de forma inequívoca. */
  ambiguous: boolean;
};

export type OrderVariant = {
  sku: string;
  optionKey: string;
  colorName: string | null;
  size: string | null;
  imageUrl: string | null;
};

export type VariantSelection = {
  sku: string | null;
  optionKey: string | null;
  colorName: string | null;
  size: string | null;
  imageUrl: string | null;
};

export type VariantSelectionPrompt =
  | "Elige un color"
  | "Elige una talla"
  | "Solicita revisión de variante";

/**
 * Decide qué variante exacta se puede guardar en carrito.
 *
 * Las opciones únicas que no exigen una decisión del cliente se resuelven de
 * forma implícita. Si hay varios colores o varias tallas, obliga a elegirlos
 * para no crear líneas ambiguas con `variantSku: null`.
 */
export function resolveOrderVariantSelection(
  options: ColorOption[] | undefined,
  selected: VariantSelection | null,
): { variant: OrderVariant | null; prompt: VariantSelectionPrompt | null } {
  if (!options || options.length === 0) {
    return { variant: null, prompt: null };
  }

  // Si alguna variante tiene stock, las opciones a cero dejan de ser
  // elegibles. Si TODAS están a cero, el producto opera bajo pedido.
  const productHasStock = options.some((option) => option.totalStock > 0);
  const eligibleOptions = productHasStock
    ? options.filter((option) => option.totalStock > 0)
    : options;
  const selectedOption = selected
    ? eligibleOptions.find(
        (option) =>
          option.key === selected.optionKey ||
          (selected.optionKey == null &&
            selected.colorName != null &&
            option.colorName === selected.colorName),
      )
    : undefined;

  if (eligibleOptions.length > 1 && !selectedOption) {
    return { variant: null, prompt: "Elige un color" };
  }

  const option = selectedOption ?? eligibleOptions[0];
  if (!option || option.ambiguous) {
    return { variant: null, prompt: "Solicita revisión de variante" };
  }

  const eligibleSizes = selectableSizesForOption(option);
  const selectedSize = selected?.sku
    ? eligibleSizes.find((size) => size.sku === selected.sku)
    : undefined;

  if (selectedSize) {
    return {
      variant: {
        sku: selectedSize.sku,
        optionKey: option.key,
        colorName: option.colorName,
        size: selectedSize.size,
        imageUrl: option.imageUrl,
      },
      prompt: null,
    };
  }

  if (eligibleSizes.length > 1) {
    return { variant: null, prompt: "Elige una talla" };
  }
  if (eligibleSizes.length === 1) {
    const size = eligibleSizes[0];
    return {
      variant: {
        sku: size.sku,
        optionKey: option.key,
        colorName: option.colorName,
        size: size.size,
        imageUrl: option.imageUrl,
      },
      prompt: null,
    };
  }

  if (option.variantCount !== 1 || option.untaggedVariantCount !== 1) {
    return { variant: null, prompt: "Solicita revisión de variante" };
  }
  return {
    variant: {
      sku: option.primarySku,
      optionKey: option.key,
      colorName: option.colorName,
      size: null,
      imageUrl: option.imageUrl,
    },
    prompt: null,
  };
}

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
    const colorName = v.colorName?.trim() || null;
    const key = colorName?.toLowerCase() ?? "__no_color__";
    let opt = byColor.get(key);
    if (!opt) {
      opt = {
        key,
        colorName,
        colorHex: v.colorHex ?? null,
        imageUrl: v.imageUrl,
        sizes: [],
        primarySku: v.sku,
        totalStock: 0,
        variantCount: 0,
        untaggedVariantCount: 0,
        ambiguous: false,
      };
      byColor.set(key, opt);
    }
    // La imagen/hex del color: primer valor no nulo que aparezca
    if (!opt.imageUrl && v.imageUrl) opt.imageUrl = v.imageUrl;
    if (!opt.colorHex && v.colorHex) opt.colorHex = v.colorHex;
    opt.totalStock += v.stockQty ?? 0;
    opt.variantCount += 1;

    const size = extractSize(v);
    if (size) {
      // Dos SKU con el mismo color+talla son indistinguibles para el cliente:
      // no elegimos uno por stock, lo marcamos para revisión humana.
      const existing = opt.sizes.find((s) => s.size === size);
      if (!existing) {
        opt.sizes.push({ size, sku: v.sku, stockQty: v.stockQty ?? 0 });
      } else {
        opt.ambiguous = true;
      }
    } else {
      opt.untaggedVariantCount += 1;
      if (opt.untaggedVariantCount > 1) opt.ambiguous = true;
    }
  }

  const options = [...byColor.values()];
  for (const opt of options) {
    if (opt.sizes.length > 0 && opt.untaggedVariantCount > 0) {
      opt.ambiguous = true;
    }
    opt.sizes.sort(sizeSort);
  }
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
