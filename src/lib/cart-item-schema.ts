import { z } from "zod";

/**
 * Schema compartido de una LÍNEA de carrito tal como viaja del navegador al
 * servidor. Fuente única para /api/cart-quote (cotización completa) y
 * /api/cart-quote/save-for-later (captura temprana de email) — así la
 * recuperación del carrito guardado es fiel al carrito real, marcajes incluidos.
 */
export const CartMarkingSchema = z.object({
  positionId: z.string().min(1).max(60),
  positionLabel: z.string().max(120).optional().nullable(),
  techniqueCode: z.string().min(1).max(40),
  techniqueName: z.string().max(120).optional().nullable(),
  numberOfColors: z.number().int().min(1).max(20).default(1),
  manipulationCode: z.string().max(2).optional().nullable(),
  // Área de impresión (cm²) de la posición. El recálculo server-side la pasa a
  // calculateMarkingCost para elegir el MISMO tramo AreaRange que vio la ficha
  // (sin ella cogería el tramo más barato y cobraría de menos).
  printAreaCm2: z.number().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const CartItemSchema = z.object({
  productSlug: z.string().min(1),
  productRef: z.string().min(1),
  productName: z.string().min(1),
  primaryImageUrl: z.string().nullable().optional(),
  quantity: z.number().int().positive().max(1_000_000),
  variantSku: z.string().nullable().optional(),
  colorName: z.string().nullable().optional(),
  // Shape plano (deprecated, mantenido por compat)
  markingTechniqueCode: z.string().nullable().optional(),
  markingTechniqueName: z.string().nullable().optional(),
  markingPositionId: z.string().nullable().optional(),
  markingColours: z.number().int().min(1).max(10).nullable().optional(),
  markingComplexity: z.string().max(2).nullable().optional(),
  // Nuevo: array completo multi-marca
  markings: z.array(CartMarkingSchema).max(10).optional(),
  unitPriceClientCents: z.number().int().nullable().optional(),
  totalClientCents: z.number().int().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  customerLogoUrl: z.string().max(500).nullable().optional(),
  customerLogoFilename: z.string().max(200).nullable().optional(),
  customerLogoSize: z.number().int().nullable().optional(),
});

export type CartItemInput = z.infer<typeof CartItemSchema>;

/** Persistencia Prisma de una línea + sus marcajes (create anidado). */
export function cartItemToCreate(it: CartItemInput) {
  const markingsArr =
    it.markings && it.markings.length > 0
      ? it.markings
      : it.markingPositionId && it.markingTechniqueCode
        ? [
            {
              positionId: it.markingPositionId,
              positionLabel: null,
              techniqueCode: it.markingTechniqueCode,
              techniqueName: it.markingTechniqueName || null,
              numberOfColors: it.markingColours || 1,
              manipulationCode: it.markingComplexity || null,
              printAreaCm2: null,
              notes: null,
            },
          ]
        : [];
  const first = markingsArr[0];
  return {
    productSlug: it.productSlug,
    productRef: it.productRef,
    productName: it.productName,
    primaryImageUrl: it.primaryImageUrl ?? null,
    quantity: it.quantity,
    variantSku: it.variantSku ?? null,
    colorName: it.colorName ?? null,
    markingTechniqueCode: first?.techniqueCode ?? null,
    markingTechniqueName: first?.techniqueName ?? null,
    markingPositionId: first?.positionId ?? null,
    markingColours: first?.numberOfColors ?? null,
    markingComplexity: first?.manipulationCode ?? it.markingComplexity ?? null,
    unitPriceClientCents: it.unitPriceClientCents ?? null,
    totalClientCents: it.totalClientCents ?? null,
    notes: it.notes ?? null,
    customerLogoUrl: it.customerLogoUrl ?? null,
    customerLogoFilename: it.customerLogoFilename ?? null,
    customerLogoSize: it.customerLogoSize ?? null,
    markings:
      markingsArr.length > 0
        ? {
            create: markingsArr.map((m, idx) => ({
              positionId: m.positionId,
              positionLabel: m.positionLabel ?? null,
              techniqueCode: m.techniqueCode,
              techniqueName: m.techniqueName ?? null,
              numberOfColors: m.numberOfColors,
              manipulationCode: m.manipulationCode ?? null,
              printAreaCm2: m.printAreaCm2 ?? null,
              notes: m.notes ?? null,
              order: idx,
            })),
          }
        : undefined,
  };
}
