import { prisma } from "@/lib/prisma";
import { calculateMarkingCost, applyMargin } from "@/lib/marking-cost";
import { defaultTiersFromBase, orderTotalCents, pickTier } from "@/lib/pricing";
import { loadActivePromotions } from "@/lib/promotions";
import { computeClientPricing } from "@/lib/product-pricing";

/**
 * Recálculo de precio de una línea EN SERVIDOR — fuente autoritativa.
 *
 * Espejo EXACTO del pipeline de /api/quote/calculate: coste neto → margen →
 * override → promo (producto) + margen sobre coste de marcaje. Existe para que
 * el checkout de PAGO DIRECTO no cobre en Stripe el importe que calcula el
 * navegador (manipulable): en /api/cart-quote, cuando directPay=true, se
 * recalcula cada línea con esta función y ESE total es el que se cobra.
 *
 * Si la ficha y el checkout divergen, ES un bug: ambos deben pasar por aquí.
 */

export type ServerMarkingInput = {
  techniqueCode: string;
  numberOfColours?: number | null;
  printAreaCm2?: number | null;
  manipulationCode?: string | null;
  positionCount?: number | null;
};

export type ServerLineInput = {
  productSlug: string;
  quantity: number;
  markings: ServerMarkingInput[];
};

export type ServerLinePricing =
  | {
      ok: true;
      productClientCents: number;
      markingClientCents: number;
      totalClientCents: number;
      unitClientCents: number;
      priceSource: "provider" | "estimate";
    }
  | { ok: false; reason: string };

type ActivePromos = Awaited<ReturnType<typeof loadActivePromotions>>;

/**
 * Recalcula una línea. `activePromos` se pasa desde fuera para cargarlo UNA vez
 * por carrito (no una consulta por línea). Usa {@link loadActivePromotions} si
 * se llama con una sola línea suelta.
 */
export async function computeServerLinePricing(
  line: ServerLineInput,
  activePromos: ActivePromos,
): Promise<ServerLinePricing> {
  const product = await prisma.product.findUnique({
    where: { slug: line.productSlug },
    include: {
      variants: {
        where: { priceTiers: { some: {} } },
        orderBy: { sku: "asc" },
        take: 1,
        include: { priceTiers: { orderBy: { minQty: "asc" } } },
      },
      category: { select: { name: true } },
      override: true,
    },
  });
  if (!product) return { ok: false, reason: `Producto no encontrado: ${line.productSlug}` };
  if (line.quantity < 1) return { ok: false, reason: "Cantidad inválida" };

  const variantWithTiers = product.variants[0];
  const clientPricing = computeClientPricing({
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      categoryId: product.categoryId,
      fromPriceCents: product.fromPriceCents,
      category: product.category ? { name: product.category.name } : null,
    },
    override: product.override
      ? {
          customFromPriceCents: product.override.customFromPriceCents,
          marginPct: product.override.marginPct,
          marketingTags: product.override.marketingTags,
        }
      : null,
    providerNetTiers: variantWithTiers?.priceTiers.map((t) => ({
      minQty: t.minQty,
      unitPriceCents: t.unitPriceCents,
    })),
    activePromos,
  });
  const clientTiers =
    clientPricing.clientTiers ??
    (clientPricing.baseCentsForEstimate
      ? defaultTiersFromBase(clientPricing.baseCentsForEstimate)
      : []);
  const productTier = pickTier(clientTiers, line.quantity);
  const productUnitClientCents =
    productTier?.unitPriceCents ?? clientPricing.baseCentsForEstimate ?? 0;
  const priceSource: "provider" | "estimate" = clientPricing.clientTiers
    ? "provider"
    : "estimate";

  let markingNetTotalCents = 0;
  for (const m of line.markings) {
    try {
      const br = await calculateMarkingCost({
        techniqueCode: m.techniqueCode,
        quantity: line.quantity,
        positionCount: m.positionCount ?? undefined,
        printAreaCm2: m.printAreaCm2 ?? undefined,
        numberOfColours: m.numberOfColours ?? undefined,
        manipulationCode: m.manipulationCode ?? undefined,
      });
      markingNetTotalCents += br.totalCostCents ?? 0;
    } catch (e) {
      return {
        ok: false,
        reason: `Error al calcular marcaje ${m.techniqueCode}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const productSubtotalClientCents = productUnitClientCents * line.quantity;
  const productClientCents = orderTotalCents(
    productSubtotalClientCents,
    clientPricing.orderFixedPromo,
  );
  const markingClientCents = applyMargin(markingNetTotalCents);
  const totalClientCents = productClientCents + markingClientCents;
  const unitClientCents =
    line.quantity > 0 ? Math.round(totalClientCents / line.quantity) : 0;

  return {
    ok: true,
    productClientCents,
    markingClientCents,
    totalClientCents,
    unitClientCents,
    priceSource,
  };
}
