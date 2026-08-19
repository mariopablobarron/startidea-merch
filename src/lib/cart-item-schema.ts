import { z } from "zod";
import { normalizeProductName } from "@/lib/product-name";

/**
 * Schema compartido de una LÍNEA de carrito tal como viaja del navegador al
 * servidor. Fuente única para /api/cart-quote (cotización completa) y
 * /api/cart-quote/save-for-later (captura temprana de email) — así la
 * recuperación del carrito guardado es fiel al carrito real, marcajes incluidos.
 */
/**
 * Topes de longitud de los campos que el navegador controla y que se PERSISTEN
 * tal cual en `CartQuoteItem` / `CartQuoteItemMarking`. Las dos rutas que usan
 * este schema (`/api/cart-quote` y `/api/cart-quote/save-for-later`) son
 * PÚBLICAS: sin sesión ni secreto, sólo rate limit por IP.
 *
 * Los tres de marcaje son los MISMOS que ya regían la vía nueva `markings[]`.
 * El shape plano legado no los tenía, así que mandar el marcaje por él saltaba
 * el tope de la vía nueva — el fallback de `cartItemToCreate` lo persiste igual.
 *
 * Todos salen de MEDIR producción, no de suponer (19-ago-2026):
 *   · `productRef`: 12 el más largo sobre las líneas guardadas; 16 el mayor
 *     `supplierRef` del catálogo entero ⇒ 60 deja ~4x.
 *   · `primaryImageUrl`: 23 el más largo (son rutas `/api/m/<hash>`) ⇒ 500,
 *     el mismo tope que ya tiene `customerLogoUrl`.
 *   · `variantId`: cuid de 25; `sku`: 20; `colorName`: 25 — sobre las 38.647
 *     variantes reales. (Estos tres se canonicalizan antes de guardar, pero
 *     antes de eso alimentan una consulta a BD, y esa sí acepta lo que llegue.)
 *   · `productSlug`: 80 el más largo sobre 9.626 productos ⇒ 160.
 */
export const MAX_REF = 60;
export const MAX_SLUG = 160;
export const MAX_URL = 500;
export const MAX_ID = 100;
export const MAX_SKU = 60;
export const MAX_COLOR = 120;
export const MAX_POSITION_ID = 60;
export const MAX_TECHNIQUE_CODE = 40;
export const MAX_TECHNIQUE_NAME = 120;

export const CartMarkingSchema = z.object({
  positionId: z.string().min(1).max(MAX_POSITION_ID),
  positionLabel: z.string().max(120).optional().nullable(),
  techniqueCode: z.string().min(1).max(MAX_TECHNIQUE_CODE),
  techniqueName: z.string().max(MAX_TECHNIQUE_NAME).optional().nullable(),
  numberOfColors: z.number().int().min(1).max(20).default(1),
  manipulationCode: z.string().max(2).optional().nullable(),
  // Área de impresión (cm²) de la posición. El recálculo server-side la pasa a
  // calculateMarkingCost para elegir el MISMO tramo AreaRange que vio la ficha
  // (sin ella cogería el tramo más barato y cobraría de menos).
  printAreaCm2: z.number().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const CartItemSchema = z.object({
  productSlug: z.string().min(1).max(MAX_SLUG),
  productRef: z.string().min(1).max(MAX_REF),
  productName: z.string().min(1).max(500),
  primaryImageUrl: z.string().max(MAX_URL).nullable().optional(),
  quantity: z.number().int().positive().max(1_000_000),
  variantId: z.string().max(MAX_ID).nullable().optional(),
  /** Compatibilidad de pestañas antiguas; se canonicaliza antes de guardar. */
  variantSku: z.string().max(MAX_SKU).nullable().optional(),
  colorName: z.string().max(MAX_COLOR).nullable().optional(),
  // Shape plano (deprecated, mantenido por compat). Los topes son LOS MISMOS
  // que los de `CartMarkingSchema`: sin ellos, mandar el marcaje por esta vía
  // saltaba los de la vía nueva (ver cabecera).
  markingTechniqueCode: z.string().max(MAX_TECHNIQUE_CODE).nullable().optional(),
  markingTechniqueName: z.string().max(MAX_TECHNIQUE_NAME).nullable().optional(),
  markingPositionId: z.string().max(MAX_POSITION_ID).nullable().optional(),
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
}).refine((item) => !(item.variantId && item.variantSku), {
  message: "Usa variantId o variantSku legacy, no ambos",
  path: ["variantId"],
});

export type CartItemInput = z.infer<typeof CartItemSchema>;
export type CanonicalCartItemInput = Omit<CartItemInput, "variantId"> & {
  variantId?: never;
};

/** Persistencia Prisma de una línea + sus marcajes (create anidado). */
export function cartItemToCreate(it: CanonicalCartItemInput) {
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
    productName: normalizeProductName(it.productName),
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
