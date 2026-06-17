/**
 * Promotions — engine de aplicación de descuentos programados.
 *
 * Este módulo añade lo único que toca BD (`loadActivePromotions`) y re-exporta
 * el núcleo PURO desde `promotions-core.ts`. Importa desde aquí en código de
 * servidor; desde `promotions-core.ts` directamente en componentes cliente
 * (para no arrastrar prisma al bundle).
 *
 * Filosofía:
 *   - Pure functions, sin side effects → fáciles de testear (en promotions-core).
 *   - Stateless: el caller carga las promos activas una vez y se las pasa.
 *   - No acumulables: si un producto entra en 2 promos, gana la mejor.
 *   - PERCENT se hornea por unidad (invariante a cantidad); FIXED es descuento
 *     de PEDIDO (una vez sobre el subtotal) — ver promotions-core para el porqué.
 */
import { prisma } from "@/lib/prisma";
import type { Promotion } from "@prisma/client";

// ─── Carga ──────────────────────────────────────────────────────────────────

/**
 * Carga todas las promociones que están activas y dentro de su ventana
 * temporal en este momento. Resultado típico: 0–10 promos, así que el
 * matching posterior es O(productos × promos) trivial.
 */
export async function loadActivePromotions(now: Date = new Date()): Promise<Promotion[]> {
  return prisma.promotion.findMany({
    where: {
      active: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: [{ scope: "asc" }, { value: "desc" }],
  });
}

// ─── Núcleo puro (re-export) ──────────────────────────────────────────────────
export {
  promotionMatchesProduct,
  matchingPromotions,
  pickBestPercentPromotion,
  pickBestFixedPromotion,
  pickDisplayPromotion,
  pickOrderFixedPromotion,
  applyPromotionToPrice,
  applyBestPromotion,
  applyBestUnitPromotion,
  applyBestPromotionToTiers,
  noPromo,
  defaultBadgeText,
  getBadgeText,
  promotionStatus,
} from "@/lib/promotions-core";

export type {
  ProductForPromo,
  AppliedPromotion,
  Promotion,
  PromotionKind,
  PromotionScope,
} from "@/lib/promotions-core";
