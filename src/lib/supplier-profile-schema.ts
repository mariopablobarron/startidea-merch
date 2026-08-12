import { z } from "zod";

/**
 * Ficha comercial del proveedor (`/admin/suppliers`, Fase A del módulo).
 *
 * Vive en `lib/` y no dentro del `route.ts` por la razón que ya costó dos
 * arreglos a medias: un esquema encerrado en una ruta de Next **no se puede
 * testear** (y un `route.ts` tampoco puede exportar helpers sin romper
 * `next build`), así que la casilla que GUARDA el dato queda sin red mientras
 * el cerrojo que lo COBRA aparenta cubrirlo. El 12-ago bajar un `.min(1)` a
 * `.min(0)` no rompía ninguno de los 1.093 tests que había.
 *
 * `defaultShippingCents` es dinero: precarga los portes del cotizador, que son
 * un COSTE y salen multiplicados por el margen en el PVP. Aquí `0` SÍ es
 * legítimo (proveedor franco de portes) —a diferencia del precio fijo de
 * producto—, pero un negativo o un decimal no lo son nunca.
 */
export const SUPPLIER_CODES = ["midocean", "makito", "cifra", "adivin"] as const;

export type SupplierCodeValue = (typeof SUPPLIER_CODES)[number];

export const SUPPLIER_DEFAULT_NAMES: Record<SupplierCodeValue, string> = {
  midocean: "MidOcean",
  makito: "Makito",
  cifra: "Cifra",
  adivin: "Adivin",
};

/** Techo de portes por defecto: 10.000 €. El mismo que acepta la API de cotizar. */
export const MAX_DEFAULT_SHIPPING_CENTS = 1_000_000;

export const SupplierProfileSchema = z
  .object({
    code: z.enum(SUPPLIER_CODES),
    name: z.string().min(1).max(80).optional(),
    active: z.boolean().optional(),
    hasAutoSync: z.boolean().optional(),
    contactName: z.string().max(120).nullable().optional(),
    contactEmail: z.string().max(200).nullable().optional(),
    contactPhone: z.string().max(60).nullable().optional(),
    paymentTerms: z.string().max(500).nullable().optional(),
    minOrderNotes: z.string().max(500).nullable().optional(),
    leadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
    defaultShippingCents: z
      .number()
      .int("Los portes por defecto van en céntimos enteros")
      .min(0)
      .max(MAX_DEFAULT_SHIPPING_CENTS)
      .nullable()
      .optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export type SupplierProfileInput = z.infer<typeof SupplierProfileSchema>;
