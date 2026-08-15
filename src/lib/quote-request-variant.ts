import type { ProposalVariantSelection } from "./proposal-types";

export type QuoteRequestVariantLine = {
  sku: string;
  quantity: number;
};

type QuoteRequestVariantSelectionInput = {
  variantSku?: string | null;
  colorName?: string | null;
  size?: string | null;
  variantLines?: ReadonlyArray<{
    sku: string;
    colorName?: string | null;
    size?: string | null;
    quantity: number;
  }>;
};

export type CanonicalQuoteVariant = {
  sku: string;
  colorName: string | null;
  size: string | null;
};

/** Valida que una solicitud use un único modo y que su matriz cuadre con qty. */
export function validateQuoteRequestVariantDistribution(
  quantity: number,
  variantSku: string | null | undefined,
  lines: ReadonlyArray<QuoteRequestVariantLine> | undefined,
): string | null {
  if (variantSku && lines !== undefined) {
    return "Usa una variante individual o un reparto por tallas, no ambos.";
  }
  // `undefined` significa que el cliente solicita revisión manual. Un array
  // explícito vacío, en cambio, significa que activó la matriz sin repartir
  // ninguna unidad y no se puede convertir silenciosamente en una solicitud
  // genérica de 1 ud.
  if (lines === undefined) return null;
  if (lines.length === 0) {
    return "Indica al menos una cantidad en el reparto de variantes.";
  }

  const matrixTotal = lines.reduce((sum, line) => sum + line.quantity, 0);
  const uniqueSkus = new Set(lines.map((line) => line.sku));
  if (matrixTotal !== quantity || uniqueSkus.size !== lines.length) {
    return "El reparto de variantes no coincide con la cantidad solicitada.";
  }
  return null;
}

/**
 * Reconstruye la variante comercial exclusivamente con metadatos de BD.
 * `colorName` y `size` del POST se aceptan por compatibilidad de esquema, pero
 * nunca llegan al borrador ni al PDF.
 */
export function canonicalizeQuoteRequestVariantSelection(
  input: QuoteRequestVariantSelectionInput,
  canonicalVariants: ReadonlyArray<CanonicalQuoteVariant>,
): ProposalVariantSelection | null {
  if (input.variantLines !== undefined) {
    if (input.variantLines.length !== canonicalVariants.length) return null;
    const variantLines = input.variantLines.map((line, index) => {
      const canonical = canonicalVariants[index];
      if (!canonical || canonical.sku !== line.sku) return null;
      return {
        sku: canonical.sku,
        colorName: canonical.colorName,
        size: canonical.size,
        quantity: line.quantity,
      };
    });
    if (variantLines.some((line) => line === null)) return null;
    const exactLines = variantLines.filter(
      (line): line is NonNullable<typeof line> => line !== null,
    );
    return {
      summary: exactLines
        .map(
          (line) =>
            `${line.quantity}× ${line.sku}${line.colorName ? ` · ${line.colorName}` : ""}${line.size ? ` · talla ${line.size}` : ""}`,
        )
        .join(" · "),
      variantSku: null,
      colorName: null,
      size: null,
      variantLines: exactLines,
    };
  }

  if (input.variantSku) {
    const canonical = canonicalVariants[0];
    if (
      canonicalVariants.length !== 1 ||
      !canonical ||
      canonical.sku !== input.variantSku
    ) {
      return null;
    }
    return {
      summary: `${canonical.sku}${canonical.colorName ? ` · ${canonical.colorName}` : ""}${canonical.size ? ` · talla ${canonical.size}` : ""}`,
      variantSku: canonical.sku,
      colorName: canonical.colorName,
      size: canonical.size,
    };
  }

  return {
    summary: "pendiente de revisión",
    variantSku: null,
    colorName: null,
    size: null,
  };
}
