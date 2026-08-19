import { z } from "zod";
import { MAX_SLUG, MAX_POSITION_ID } from "@/lib/cart-item-schema";

/**
 * Schema del cuerpo de `/api/mockup-request` (capa D del sistema de mockup:
 * el cliente pide mockup técnico real al equipo desde la ficha de producto).
 *
 * La ruta es PÚBLICA: sin sesión ni secreto, sólo rate limit por IP. Todo lo
 * que llega se persiste en `MockupRequest` y además viaja a dos emails y a
 * Telegram, así que cada campo tiene que estar acotado.
 *
 * Los dos topes que faltaban salen de MEDIR producción (19-ago-2026), no de
 * suponer:
 *   · `productSlug`: 80 el más largo sobre 9.626 productos ⇒ `MAX_SLUG` (160)
 *     deja 2x. Importa especialmente porque cuando el slug NO resuelve a un
 *     producto real se guarda crudo y se usa como nombre de producto en los
 *     emails.
 *   · `positionId`: 50 el más largo sobre 22.937 `MarkingPosition` reales.
 *
 * Se reutilizan las constantes del carrito a propósito: es el mismo dato
 * (slug de producto, id de posición de marcaje) viajando por otra puerta, y
 * tener dos cifras distintas para lo mismo es cómo se cuela un tope olvidado.
 */
export const MockupRequestSchema = z.object({
  productSlug: z.string().min(1).max(MAX_SLUG),
  positionId: z.string().max(MAX_POSITION_ID).optional().nullable(),
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  company: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  brief: z.string().max(2000).optional().nullable(),
  sourceUrl: z.string().max(500).optional().nullable(),
});

export type MockupRequestInput = z.infer<typeof MockupRequestSchema>;
