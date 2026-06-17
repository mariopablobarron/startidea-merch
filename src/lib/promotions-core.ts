/**
 * Promotions core — lógica PURA del engine de descuentos (sin prisma, sin red).
 *
 * Vive separado de `promotions.ts` (que añade `loadActivePromotions`, lo único
 * que toca BD) para que:
 *   - se pueda importar desde componentes cliente sin arrastrar prisma al bundle.
 *   - los tests unitarios trabajen contra funciones puras.
 *
 * Semántica de descuentos (IMPORTANTE):
 *   - PERCENT es invariante a la cantidad: un −20% por unidad == −20% del pedido.
 *     Por eso PERCENT SÍ se hornea en el precio unitario de cada tier.
 *   - FIXED (céntimos a descontar) NO es invariante a la cantidad. Aplicado por
 *     unidad y multiplicado por la cantidad descuenta `value × qty` (bug: un
 *     "−5€" en 250 uds restaba 1.250€ y dejaba a 0 el merch barato). Por eso
 *     FIXED es un descuento de PEDIDO: se aplica UNA sola vez sobre el subtotal
 *     (ver `orderTotalCents` en `pricing.ts`), nunca por unidad ni por tier.
 *   - No acumulables: gana la mejor promo. Si hay PERCENT y FIXED para el mismo
 *     producto, PERCENT manda (se hornea en la unidad) y FIXED se ignora, para
 *     no apilar descuentos.
 */
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

/** Todas las promos que matchean el producto (sin mirar fecha — ya filtradas). */
export function matchingPromotions(product: ProductForPromo, promos: Promotion[]): Promotion[] {
  return promos.filter((p) => promotionMatchesProduct(p, product));
}

/** Mejor promo PERCENT que matchea (mayor %), o null. */
export function pickBestPercentPromotion(
  product: ProductForPromo,
  promos: Promotion[],
): Promotion | null {
  let best: Promotion | null = null;
  for (const p of promos) {
    if (p.kind !== "PERCENT") continue;
    if (!promotionMatchesProduct(p, product)) continue;
    if (!best || p.value > best.value) best = p;
  }
  return best;
}

/** Mejor promo FIXED que matchea (mayor descuento absoluto), o null. */
export function pickBestFixedPromotion(
  product: ProductForPromo,
  promos: Promotion[],
): Promotion | null {
  let best: Promotion | null = null;
  for (const p of promos) {
    if (p.kind !== "FIXED") continue;
    if (!promotionMatchesProduct(p, product)) continue;
    if (!best || p.value > best.value) best = p;
  }
  return best;
}

/**
 * Promo a mostrar en badge/banda: PERCENT manda sobre FIXED (no acumulables).
 * Solo informa; el dinero real lo deciden los tiers (PERCENT) y el total (FIXED).
 */
export function pickDisplayPromotion(
  product: ProductForPromo,
  promos: Promotion[],
): Promotion | null {
  return pickBestPercentPromotion(product, promos) ?? pickBestFixedPromotion(product, promos);
}

/**
 * Descuento FIXED a nivel de PEDIDO para este producto: el mejor FIXED que
 * matchea, PERO solo si NO hay un PERCENT que matchee (no acumulables, PERCENT
 * gana). Devuelve null si no hay FIXED aplicable a nivel de pedido.
 */
export function pickOrderFixedPromotion(
  product: ProductForPromo,
  promos: Promotion[],
): Promotion | null {
  if (pickBestPercentPromotion(product, promos)) return null;
  return pickBestFixedPromotion(product, promos);
}

// ─── Aplicación ─────────────────────────────────────────────────────────────

/**
 * Aplica una promo concreta a un IMPORTE (unidad o subtotal de pedido).
 * Math correcto para cualquier importe; el caller decide a qué importe llamarla.
 * Nunca baja de 0.
 */
export function applyPromotionToPrice(
  promo: Promotion,
  originalCents: number,
): AppliedPromotion {
  if (originalCents <= 0) {
    return { finalCents: 0, originalCents, discountCents: 0, discountPct: 0, promo };
  }

  let discountCents: number;
  if (promo.kind === "PERCENT") {
    // value es 0–100 (entero). Ej. value=20 → -20%.
    const pct = Math.max(0, Math.min(100, promo.value));
    discountCents = Math.round((originalCents * pct) / 100);
  } else {
    // FIXED: value es céntimos a descontar.
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
 * Mejor promo aplicable a un IMPORTE genérico (la que deje el `finalCents` más
 * bajo). Correcta para un SUBTOTAL de pedido (PERCENT y FIXED ahí son ambos
 * seguros). NO usar sobre un precio unitario con intención de multiplicar
 * después por la cantidad: para eso está `applyBestUnitPromotion`.
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
 * Mejor promo aplicable a un PRECIO UNITARIO (para mostrar precio "antes/ahora"
 * por unidad y en cada tier). SOLO considera PERCENT, porque solo PERCENT es
 * invariante a la cantidad. FIXED se ignora aquí (es descuento de pedido, ver
 * `pickOrderFixedPromotion` + `orderTotalCents`). Así un FIXED nunca corrompe
 * el precio unitario ni se multiplica por la cantidad.
 */
export function applyBestUnitPromotion(
  product: ProductForPromo,
  unitCents: number,
  activePromos: Promotion[],
): AppliedPromotion {
  if (unitCents <= 0 || activePromos.length === 0) {
    return noPromo(unitCents);
  }

  let best: AppliedPromotion | null = null;
  for (const promo of activePromos) {
    if (promo.kind !== "PERCENT") continue; // FIXED nunca por unidad
    if (!promotionMatchesProduct(promo, product)) continue;
    const applied = applyPromotionToPrice(promo, unitCents);
    if (!best || applied.finalCents < best.finalCents) {
      best = applied;
    }
  }

  return best ?? noPromo(unitCents);
}

/**
 * Aplica la mejor promo PER-UNIT (solo PERCENT) a TODOS los tramos de precio de
 * una variante. Mantiene coherencia card → ficha → carrito. Los FIXED NO tocan
 * los tiers (se aplican una vez al total del pedido).
 */
export function applyBestPromotionToTiers(
  product: ProductForPromo,
  tiers: Array<{ minQty: number; unitPriceCents: number }>,
  activePromos: Promotion[],
): Array<{
  minQty: number;
  unitPriceCents: number; // final (post-PERCENT)
  originalUnitPriceCents: number; // pre-promo
  promo: Promotion | null;
  discountPct: number;
}> {
  return tiers.map((tier) => {
    const r = applyBestUnitPromotion(product, tier.unitPriceCents, activePromos);
    return {
      minQty: tier.minQty,
      unitPriceCents: r.finalCents,
      originalUnitPriceCents: r.originalCents,
      promo: r.promo,
      discountPct: r.discountPct,
    };
  });
}

export function noPromo(originalCents: number): AppliedPromotion {
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
