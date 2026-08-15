const KNOWN_SIZES = new Set([
  "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL",
  "3XL", "4XL", "5XL", "6XL", "7XL", "8XL",
]);

const CIFRA_COLOR_MAP: Readonly<
  Record<string, { name: string; hex?: string; group?: string }>
> = {
  AM: { name: "Amarillo", hex: "#FBBF24", group: "amarillo" },
  AZ: { name: "Azul", hex: "#3B82F6", group: "azul" },
  RJ: { name: "Rojo", hex: "#EF4444", group: "rojo" },
  RO: { name: "Rojo", hex: "#EF4444", group: "rojo" },
  VE: { name: "Verde", hex: "#10B981", group: "verde" },
  NE: { name: "Negro", hex: "#1F2937", group: "negro" },
  BL: { name: "Blanco", hex: "#FFFFFF", group: "blanco" },
  GR: { name: "Gris", hex: "#9CA3AF", group: "gris" },
  NA: { name: "Naranja", hex: "#FB923C", group: "naranja" },
  LI: { name: "Lila", hex: "#A855F7", group: "lila" },
  RS: { name: "Rosa", hex: "#EC4899", group: "rosa" },
  FU: { name: "Fucsia", hex: "#D946EF", group: "rosa" },
  // Cifra usa MA para Marino (p. ej. T-691-L-MA y T-791-L-MA), no Marrón.
  MA: { name: "Marino", hex: "#1E3A5F", group: "azul" },
  TR: { name: "Transparente", hex: "#E5E7EB", group: "transparente" },
};

export function extractCifraColorSuffix(model: string, rootmodel: string): string | null {
  const prefix = `${rootmodel}-`;
  if (!model.startsWith(prefix)) return null;
  const suffix = model.slice(prefix.length);
  return suffix.length > 0 ? suffix : null;
}

export function resolveCifraColor(suffix: string | null): {
  name: string | null;
  hex: string | null;
  group: string | null;
} {
  if (!suffix) return { name: null, hex: null, group: null };
  const mapped = CIFRA_COLOR_MAP[suffix.toUpperCase()];
  if (mapped) {
    return {
      name: mapped.name,
      hex: mapped.hex ?? null,
      group: mapped.group ?? null,
    };
  }
  return { name: suffix, hex: null, group: null };
}

export type CifraVariantDimensions = {
  colorName: string | null;
  colorGroup: string | null;
  colorHex: string | null;
  size: string | null;
};

/**
 * Separa únicamente el dialecto cerrado de variantes Cifra:
 * `ROOT-TALLA-COLOR`. Un código desconocido nunca se interpreta como talla.
 */
export function parseCifraVariantDimensions(
  model: string,
  rootmodel: string,
): CifraVariantDimensions {
  const suffix = extractCifraColorSuffix(model, rootmodel)?.toUpperCase() ?? null;
  if (!suffix) {
    return { colorName: null, colorGroup: null, colorHex: null, size: null };
  }

  if (KNOWN_SIZES.has(suffix)) {
    return { colorName: null, colorGroup: null, colorHex: null, size: suffix };
  }

  const parts = suffix.split("-");
  if (parts.length === 2 && KNOWN_SIZES.has(parts[0])) {
    const color = resolveCifraColor(parts[1]);
    // resolveColor conserva códigos desconocidos como nombre y sin grupo. La
    // inferencia talla+color solo es segura para una entrada cerrada del mapa.
    if (color.group) {
      return {
        colorName: color.name,
        colorGroup: color.group,
        colorHex: color.hex,
        size: parts[0],
      };
    }
  }

  const color = resolveCifraColor(suffix);
  return {
    colorName: color.name,
    colorGroup: color.group,
    colorHex: color.hex,
    size: null,
  };
}

/** Corrige filas Cifra heredadas sin pisar metadatos editados/estructurados. */
export function normalizeLegacyCifraVariant<T extends {
  sku: string;
  colorName: string | null;
  colorGroup?: string | null;
  colorHex?: string | null;
  size: string | null;
}>(variant: T, rootmodel: string): T {
  const suffix = extractCifraColorSuffix(variant.sku, rootmodel);
  if (!suffix) return variant;
  const parsed = parseCifraVariantDimensions(variant.sku, rootmodel);
  const currentColor = variant.colorName?.trim().toUpperCase() || null;
  const currentGroup = variant.colorGroup?.trim() || null;
  const currentHex = variant.colorHex?.trim() || null;
  const currentSize = variant.size?.trim().toUpperCase() || null;
  const isLegacyRawColor = currentColor === suffix.toUpperCase();
  // Algunas filas Cifra históricas (Formentera T-691/T-791) llegaron sin
  // metadata de color/talla. Solo las reconstruimos si el parser cerrado
  // reconoce una talla o un código del diccionario; sufijos desconocidos no se tocan.
  const isEmptyClosedPattern =
    currentColor === null &&
    currentGroup === null &&
    currentHex === null &&
    currentSize === null &&
    (parsed.size !== null || parsed.colorGroup !== null);
  if (!isLegacyRawColor && !isEmptyClosedPattern) return variant;
  if (currentSize && currentSize !== parsed.size) return variant;
  if (
    parsed.colorName === variant.colorName &&
    parsed.size === currentSize
  ) {
    return variant;
  }

  return {
    ...variant,
    colorName: parsed.colorName,
    colorGroup: parsed.colorGroup,
    colorHex: variant.colorHex ?? parsed.colorHex,
    size: parsed.size,
  };
}
