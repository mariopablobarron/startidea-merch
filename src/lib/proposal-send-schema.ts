/**
 * Validación del cuerpo de POST /api/proposal/send.
 *
 * Vive fuera de `route.ts` porque Next sólo admite en un route handler los
 * exports que reconoce (métodos HTTP y config), y estos schemas necesitan ser
 * importables para poder probarlos.
 */
import { z } from "zod";

// Los textos del item vienen del recomendador, pero esta ruta es PÚBLICA
// (sin sesión: solo rate limit por IP), así que quien llama controla el cuerpo
// entero. Sin `.max()` un `description` de 5 MB pasaba la validación, se
// renderizaba a PDF con `renderToBuffer` (bloqueante) y se persistía en la
// columna JSON — por 5 peticiones cada 10 min y sin coste para quien las hace.
//
// Los topes están puestos ~10x por encima de lo que hay hoy en producción, que
// se midió antes de elegirlos (12 propuestas: el `quoteItems` entero más grande
// son 688 bytes; el `description` más largo, 46 caracteres; la `url`, 77). No
// recortan nada real: cortan la cola absurda. Se limita el TAMAÑO, nunca el
// CONTENIDO — rechazar por lo que dice el texto rompería una venta viva por un
// falso positivo.
const QuoteItemSchema = z.object({
  description: z.string().max(400),
  notFound: z.boolean(),
  searchedAs: z.string().max(200).optional(),
  quantity: z.number().int().nonnegative(),
  sizes: z.record(z.string().max(20), z.number()).nullable().optional(),
  technique: z.string().max(60).nullable(),
  colorRequested: z.string().max(80).nullable(),
  rationale: z.string().max(800).optional(),
  product: z
    .object({
      slug: z.string().max(200),
      name: z.string().max(200),
      ref: z.string().max(60),
      url: z.string().max(500),
      primaryImageUrl: z.string().max(500).nullable(),
    })
    .nullable(),
  unitPriceCents: z.number().int().nullable(),
  markingPerUnitCents: z.number().int().default(0),
  markingSetupCents: z.number().int().default(0),
  totalCents: z.number().int().nullable(),
  priceSource: z.enum(["tier", "estimate"]).nullable(),
});

export const BodySchema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(120).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  quoteItems: z.array(QuoteItemSchema).min(1).max(40),
  recommenderQueryId: z.string().max(40).optional().nullable(),
});
