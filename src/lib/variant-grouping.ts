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
        imageUrl: v.imageUrl,
        sizes: [],
        primarySku: v.sku,
        totalStock: 0,
      };
      byColor.set(key, opt);
    }
    // La imagen del color: primera no nula que aparezca
    if (!opt.imageUrl && v.imageUrl) opt.imageUrl = v.imageUrl;
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
