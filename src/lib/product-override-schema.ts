import { z } from "zod";

/**
 * Esquema del override de producto que teclea el admin.
 *
 * Vive en `lib/` y no dentro del `route.ts` por dos razones: un `route.ts` de
 * Next no puede exportar helpers (rompe `next build`), y sobre todo porque lo
 * que valida es DINERO y tiene que poder testearse. El 11-ago la tarifa de
 * marcaje enseñó que el cerrojo al cobrar no basta si la casilla que lo guarda
 * sigue admitiendo el dato imposible.
 *
 * `customFromPriceCents` usa `.min(1)`, no `.min(0)`: un precio absoluto de
 * 0 € se cobraba de verdad — el producto salía a 0 € en el checkout y solo se
 * facturaba el marcaje. Para "quitar el precio fijo" está `null`, que es lo
 * que manda la UI cuando se vacía el campo.
 */
export const ProductOverrideSchema = z
  .object({
    customName: z.string().min(1).max(220).nullable().optional(),
    customDescription: z.string().max(5000).nullable().optional(),
    customFromPriceCents: z
      .number()
      .int()
      .min(1, "El precio fijo no puede ser 0 € — deja el campo vacío para quitarlo")
      .max(10_000_000)
      .nullable()
      .optional(),
    marginPct: z.number().int().min(-50).max(500).nullable().optional(),
    extraImages: z.array(z.string().url()).max(10).optional(),
    featured: z.boolean().optional(),
    hidden: z.boolean().optional(),
    marketingTags: z.array(z.string().min(1).max(40)).max(10).optional(),
    metaTitle: z.string().max(160).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
    internalNotes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type ProductOverrideInput = z.infer<typeof ProductOverrideSchema>;
