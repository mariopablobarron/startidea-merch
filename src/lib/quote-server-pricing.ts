import { prisma } from "@/lib/prisma";
import { applyMargin } from "@/lib/marking-cost";
import { quoteMarkingNet } from "@/lib/marking-quote";
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
  positionId?: string | null;
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
        // Solo tramos de precio: este recálculo alimenta el checkout del
        // cliente y no debe arrastrar `images[]`/`variantId` del proveedor.
        select: { id: true, priceTiers: { orderBy: { minQty: "asc" } } },
      },
      category: { select: { name: true } },
      override: true,
      // Posiciones + técnicas del producto: los parámetros de marcaje que
      // envía el navegador NO son de fiar — validamos pertenencia y usamos
      // el área/maxColors de la BD (auditoría 2026-07-09).
      positions: {
        include: {
          techniques: { include: { technique: { select: { code: true } } } },
        },
      },
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

  // Unitario NETO al tramo (para reglas markup % de la cascada Cifra).
  const netTierForQty = variantWithTiers
    ? pickTier(
        variantWithTiers.priceTiers.map((t) => ({
          minQty: t.minQty,
          unitPriceCents: t.unitPriceCents,
          source: "PROVIDER" as const,
        })),
        line.quantity,
      )
    : null;
  const productNetUnitCents = netTierForQty?.unitPriceCents ?? product.fromPriceCents ?? 0;

  let markingNetTotalCents = 0;
  for (const m of line.markings) {
    // 1) La técnica DEBE pertenecer al producto. Preferimos la posición que
    //    dice el cliente; si no casa, buscamos cualquier posición del producto
    //    que ofrezca esa técnica. Si ninguna → NO se cobra (degrada a
    //    presupuesto): un cliente podía inyectar una técnica barata ajena.
    const positions = product.positions;
    if (positions.length === 0) {
      return { ok: false, reason: `Producto sin posiciones de marcaje; marcaje ${m.techniqueCode} no verificable` };
    }
    const claimed = m.positionId
      ? positions.find((p) => p.positionId === m.positionId)
      : undefined;
    const holder =
      claimed && claimed.techniques.some((t) => t.technique.code === m.techniqueCode)
        ? claimed
        : positions.find((p) => p.techniques.some((t) => t.technique.code === m.techniqueCode));
    if (!holder) {
      return { ok: false, reason: `Técnica ${m.techniqueCode} no disponible para este producto` };
    }
    const link = holder.techniques.find((t) => t.technique.code === m.techniqueCode)!;

    // 2) Área desde la BD (dimensiones de la posición), no del navegador.
    const dbAreaCm2 =
      holder.maxWidthMm && holder.maxHeightMm
        ? (holder.maxWidthMm / 10) * (holder.maxHeightMm / 10)
        : null;
    const printAreaCm2 = dbAreaCm2 ?? m.printAreaCm2 ?? null;

    // 3) Colores capados a maxColors de la técnica en esa posición.
    const requestedColours = m.numberOfColours ?? 1;
    const numberOfColours =
      link.maxColors != null ? Math.min(requestedColours, link.maxColors) : requestedColours;

    try {
      // Cascada unificada (misma que ficha y cotizador). Si NO hay tarifa
      // fiable (warning), NO se cobra un marcaje a 0 €: la línea degrada y el
      // pago directo se convierte en presupuesto.
      const q = await quoteMarkingNet({
        productId: product.id,
        supplier: product.supplier,
        techniqueCode: m.techniqueCode,
        quantity: line.quantity,
        productNetUnitCents,
        positionCount: m.positionCount ?? undefined,
        printAreaCm2,
        numberOfColours,
        manipulationCode: m.manipulationCode,
      });
      if (!q.ok) {
        return {
          ok: false,
          reason: `Marcaje ${m.techniqueCode} sin tarifa fiable: ${q.warning ?? "sin tramo aplicable"}`,
        };
      }
      markingNetTotalCents += q.netTotalCents;
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
