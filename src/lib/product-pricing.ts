/**
 * Product pricing — FUENTE ÚNICA del precio cliente de un producto.
 *
 * Resuelve, en un solo sitio y de forma coherente, la cadena:
 *
 *     coste NETO (PriceTier/fromPriceCents)
 *       → MARGEN  (override marginPct / customFromPriceCents, o 1,6× global)
 *       → PROMO   (PERCENT por unidad · FIXED una vez por pedido)
 *
 * La usan la ficha (`/catalogo/[slug]`), las tarjetas de catálogo y promociones,
 * y la ruta `/api/quote/calculate`. Antes cada superficie improvisaba su propia
 * mezcla: la web pública mostraba el coste NETO (sin margen) y solo el path "con
 * marcaje" aplicaba el 1,6× e ignoraba override y promos → el mismo producto
 * cambiaba de precio según la superficie / el toggle de marcaje.
 *
 * Módulo PURO (sin prisma): testeable y seguro de importar en servidor.
 */
import {
  applyMargin,
  defaultTiersFromBase,
  estimateBaseCentsFromName,
  type PriceTier,
} from "@/lib/pricing";
import {
  applyBestPromotionToTiers,
  applyBestUnitPromotion,
  pickDisplayPromotion,
  pickOrderFixedPromotion,
  type ProductForPromo,
  type Promotion,
} from "@/lib/promotions-core";

/** Subconjunto de ProductOverride relevante para precio. */
export type PriceOverride = {
  customFromPriceCents: number | null;
  marginPct: number | null;
  marketingTags: string[];
} | null;

/** Producto mínimo necesario para tarificar. */
export type PricingProduct = {
  id: string;
  name: string;
  brand: string | null;
  categoryId: string | null;
  fromPriceCents: number | null;
  category?: { name: string | null } | null;
};

/** Descriptor serializable del FIXED de pedido (para pasar a componentes cliente). */
export type OrderFixedPromo = {
  value: number; // céntimos a descontar UNA vez del subtotal
  name: string;
  badgeText: string | null;
  badgeColor: string | null;
} | null;

export type ClientPricing = {
  promoInput: ProductForPromo;
  /** "desde" cliente final (post-override, post-PERCENT) para mostrar en grande. */
  fromPriceCents: number | null;
  /** "desde" cliente pre-promo (post-override) — para el precio tachado. */
  originalFromPriceCents: number | null;
  /** Promo a pintar en badge/banda (PERCENT manda sobre FIXED). */
  bannerPromo: Promotion | null;
  /** Tiers cliente con margen+override aplicados y PERCENT horneado por unidad. */
  clientTiers: PriceTier[] | undefined;
  /** FIXED de pedido (solo si NO hay PERCENT) — se aplica una vez al total. */
  orderFixedPromo: OrderFixedPromo;
  /** Base cliente para estimar tiers cuando no hay tiers de proveedor. */
  baseCentsForEstimate: number | undefined;
};

/** ¿El admin fijó el precio explícitamente (descarta tiers de proveedor)? */
export function adminOverridesPrice(override: PriceOverride): boolean {
  return override?.customFromPriceCents != null || override?.marginPct != null;
}

/**
 * Precio "desde" CLIENTE (post-margen/override, SIN promo) a partir del neto.
 *   - customFromPriceCents → precio cliente absoluto (ya con margen del admin).
 *   - marginPct            → neto × (1 + marginPct/100).
 *   - sin override         → neto × margen global (1,6×).
 */
export function clientFromPriceCents(
  netFromPriceCents: number | null,
  override: PriceOverride,
): number | null {
  if (override?.customFromPriceCents != null) return override.customFromPriceCents;
  if (netFromPriceCents == null) return null;
  if (override?.marginPct != null) {
    return Math.round((netFromPriceCents * (100 + override.marginPct)) / 100);
  }
  return applyMargin(netFromPriceCents);
}

function promoInputFor(product: PricingProduct, override: PriceOverride): ProductForPromo {
  return {
    id: product.id,
    categoryId: product.categoryId,
    brand: product.brand,
    override: override ? { marketingTags: override.marketingTags } : null,
  };
}

function toOrderFixedPromo(promo: Promotion | null): OrderFixedPromo {
  if (!promo) return null;
  return {
    value: promo.value,
    name: promo.name,
    badgeText: promo.badgeText,
    badgeColor: promo.badgeColor,
  };
}

/**
 * Precio "desde" para tarjetas/listados: cliente + override + PERCENT, con la
 * promo a pintar en el badge. FIXED no toca el "desde" (es de pedido) pero sí
 * aparece como badge informativo.
 */
export function displayFromPrice(
  product: PricingProduct,
  override: PriceOverride,
  activePromos: Promotion[],
): {
  originalCents: number | null;
  finalCents: number | null;
  badgePromo: Promotion | null;
  hasPromo: boolean;
} {
  const original = clientFromPriceCents(product.fromPriceCents, override);
  const badgePromo = pickDisplayPromotion(promoInputFor(product, override), activePromos);
  if (original == null) {
    return { originalCents: null, finalCents: null, badgePromo, hasPromo: !!badgePromo };
  }
  const final = applyBestUnitPromotion(
    promoInputFor(product, override),
    original,
    activePromos,
  ).finalCents;
  return { originalCents: original, finalCents: final, badgePromo, hasPromo: !!badgePromo };
}

/**
 * Cálculo completo de precio cliente con tiers, para la ficha y `calculate`.
 *
 * `providerNetTiers` son los PriceTier NETOS de la variante elegida (o undefined).
 * Si el admin fijó precio (customFromPriceCents/marginPct) se descartan y los
 * tiers se reconstruyen desde el "desde" cliente con la curva por defecto.
 */
export function computeClientPricing(opts: {
  product: PricingProduct;
  override: PriceOverride;
  providerNetTiers: Array<{ minQty: number; unitPriceCents: number }> | undefined;
  activePromos: Promotion[];
}): ClientPricing {
  const { product, override, providerNetTiers, activePromos } = opts;
  const promoInput = promoInputFor(product, override);

  const originalFromPriceCents = clientFromPriceCents(product.fromPriceCents, override);

  // 1) Tiers cliente SIN promo (margen + override aplicados).
  let clientListTiers: PriceTier[] | undefined;
  if (adminOverridesPrice(override)) {
    // El admin fija el precio → ignoramos tiers de proveedor y reconstruimos.
    clientListTiers = originalFromPriceCents
      ? defaultTiersFromBase(originalFromPriceCents)
      : undefined;
  } else if (providerNetTiers && providerNetTiers.length > 0) {
    // Tiers de proveedor son NETOS → aplicamos margen global a cada tramo.
    clientListTiers = providerNetTiers.map((t) => ({
      minQty: t.minQty,
      unitPriceCents: applyMargin(t.unitPriceCents),
      source: "PROVIDER" as const,
    }));
  } else {
    clientListTiers = undefined;
  }

  // 2) Hornear PERCENT por unidad en cada tier (FIXED no toca tiers).
  const clientTiers = clientListTiers
    ? applyBestPromotionToTiers(promoInput, clientListTiers, activePromos).map((t) => ({
        minQty: t.minQty,
        unitPriceCents: t.unitPriceCents,
        source: "PROVIDER" as const,
      }))
    : undefined;

  // 3) "desde" display = original con PERCENT aplicado (FIXED no toca "desde").
  const fromPriceCents =
    originalFromPriceCents != null
      ? applyBestUnitPromotion(promoInput, originalFromPriceCents, activePromos).finalCents
      : null;

  // 4) FIXED de pedido (solo si no hay PERCENT) + promo de badge.
  const orderFixedPromo = toOrderFixedPromo(pickOrderFixedPromotion(promoInput, activePromos));
  const bannerPromo = pickDisplayPromotion(promoInput, activePromos);

  // 5) Base para estimar tiers cuando no hay tiers (cliente, con margen).
  const baseCentsForEstimate = clientTiers
    ? undefined
    : (fromPriceCents ??
      applyMargin(estimateBaseCentsFromName(product.name, product.category?.name ?? null)));

  return {
    promoInput,
    fromPriceCents,
    originalFromPriceCents,
    bannerPromo,
    clientTiers,
    orderFixedPromo,
    baseCentsForEstimate,
  };
}
