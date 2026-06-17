/**
 * Promotions — engine de aplicación de descuentos programados.
 *
 * Filosofía:
 *   - Pure functions, sin side effects → fáciles de testear.
 *   - Stateless: el caller carga las promos activas una vez y se las pasa.
 *   - No acumulables: si un producto entra en 2 promos, gana la mejor (mayor
 *     descuento absoluto sobre el precio resultante).
 *   - Orden: override de producto PRIMERO, promo DESPUÉS.
 *
 * Flujo típico desde una page:
 *   const promos = await loadActivePromotions();
 *   const result = applyBestPromotion(product, basePriceCents, promos);
 *   // result.finalCents = lo que paga el cliente
 *   // result.originalCents = precio tachado
 *   // result.promo = la Promotion aplicada (o null)
 */
import { prisma } from "@/lib/prisma";
import type { Promotion, PromotionKind, PromotionScope } from "@prisma/client";

export type ProductForPromo = {
  id: string;
  categoryId: string | null;
  brand: string | null;
  override?: { marketingTags: string[] } | null;
};

export type AppliedPromotion = {
  finalCents: number;
  originalCents: number;
  discountCents: number;
  discountPct: number; // 0–100, redondeado
  promo: Promotion | null;
};

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

// ─── Matching ───────────────────────────────────────────────────────────────

/**
 * ¿Aplica esta promo a este producto? No mira fecha (se asume ya filtrado).
 */
export function promotionMatchesProduct(promo: Promotion, product: ProductForPromo): boolean {
  switch (promo.scope) {
    case "ALL":
      return true;
    case "CATEGORY":
      return !!product.categoryId && promo.targetIds.includes(product.categoryId);
    case "BRAND":
      return !!product.brand && promo.targetIds.includes(product.brand);
    case "TAG": {
      const tags = product.override?.marketingTags ?? [];
      return tags.some((t) => promo.targetIds.includes(t));
    }
    case "PRODUCT_LIST":
      return promo.targetIds.includes(product.id);
    default:
      return false;
  }
}

// ─── Aplicación ─────────────────────────────────────────────────────────────

/**
 * Aplica una promo concreta a un precio. Devuelve el resultado calculado.
 * Nunca baja de 0.
 */
export function applyPromotionToPrice(
  promo: Promotion,
  originalCents: number,
): AppliedPromotion {
  if (originalCents <= 0) {
    return {
      finalCents: 0,
      originalCents,
      discountCents: 0,
      discountPct: 0,
      promo,
    };
  }

  let discountCents: number;
  if (promo.kind === "PERCENT") {
    // value es 0–100 (entero). Ej. value=20 → -20%.
    const pct = Math.max(0, Math.min(100, promo.value));
    discountCents = Math.round((originalCents * pct) / 100);
  } else {
    // FIXED: value es centavos a descontar.
    discountCents = Math.max(0, promo.value);
  }

  const finalCents = Math.max(0, originalCents - discountCents);
  const realDiscount = originalCents - finalCents;

  return {
    finalCents,
    originalCents,
    discountCents: realDiscount,
    discountPct: Math.round((realDiscount / originalCents) * 100),
    promo,
  };
}

/**
 * Dado un producto y un precio base, escoge la mejor promo aplicable (la
 * que deje el `finalCents` más bajo) y devuelve el resultado.
 * Si ninguna aplica, devuelve `{ finalCents=originalCents, promo:null }`.
 */
export function applyBestPromotion(
  product: ProductForPromo,
  originalCents: number,
  activePromos: Promotion[],
): AppliedPromotion {
  if (originalCents <= 0 || activePromos.length === 0) {
    return noPromo(originalCents);
  }

  let best: AppliedPromotion | null = null;
  for (const promo of activePromos) {
    if (!promotionMatchesProduct(promo, product)) continue;
    const applied = applyPromotionToPrice(promo, originalCents);
    if (!best || applied.finalCents < best.finalCents) {
      best = applied;
    }
  }

  return best ?? noPromo(originalCents);
}

/**
 * Aplica la mejor promo a TODOS los tramos de precio de una variante.
 * Útil para pintar la PriceTierTable con precios "antes/ahora" en cada
 * fila y mantener coherencia entre card → ficha → carrito.
 */
export function applyBestPromotionToTiers(
  product: ProductForPromo,
  tiers: Array<{ minQty: number; unitPriceCents: number }>,
  activePromos: Promotion[],
): Array<{
  minQty: number;
  unitPriceCents: number; // final
  originalUnitPriceCents: number; // pre-promo
  promo: Promotion | null;
  discountPct: number;
}> {
  return tiers.map((tier) => {
    const r = applyBestPromotion(product, tier.unitPriceCents, activePromos);
    return {
      minQty: tier.minQty,
      unitPriceCents: r.finalCents,
      originalUnitPriceCents: r.originalCents,
      promo: r.promo,
      discountPct: r.discountPct,
    };
  });
}

function noPromo(originalCents: number): AppliedPromotion {
  return {
    finalCents: originalCents,
    originalCents,
    discountCents: 0,
    discountPct: 0,
    promo: null,
  };
}

// ─── Helpers de UI ──────────────────────────────────────────────────────────

/**
 * Genera el texto del badge si la promo no tiene uno custom.
 *   PERCENT 20 → "−20%"
 *   FIXED 500  → "−5€"
 */
export function defaultBadgeText(kind: PromotionKind, value: number): string {
  if (kind === "PERCENT") return `−${value}%`;
  const eur = value / 100;
  // Mostrar céntimos cuando los hay: 550 → "−5,50€", 500 → "−5€".
  // Antes redondeaba al euro (550 → "−6€"), anunciando un descuento falso.
  const txt = Number.isInteger(eur)
    ? eur.toLocaleString("es-ES")
    : eur.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `−${txt}€`;
}

/**
 * Texto del badge tal y como debe pintarse (custom si lo hay, auto si no).
 */
export function getBadgeText(promo: Promotion): string {
  return promo.badgeText?.trim() || defaultBadgeText(promo.kind, promo.value);
}

/**
 * ¿La promo está en su ventana ahora mismo y activa? Útil para el admin
 * (mostrar "vigente / programada / finalizada / pausada").
 */
export function promotionStatus(
  promo: Pick<Promotion, "active" | "startsAt" | "endsAt">,
  now: Date = new Date(),
): "active" | "scheduled" | "ended" | "paused" {
  if (!promo.active) return "paused";
  if (now < promo.startsAt) return "scheduled";
  if (promo.endsAt && now > promo.endsAt) return "ended";
  return "active";
}

export type { Promotion, PromotionKind, PromotionScope };
