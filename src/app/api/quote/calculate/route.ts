import { NextResponse } from "next/server";
import { z } from "zod";
import { applyMargin } from "@/lib/marking-cost";
import { quoteMarkingNet } from "@/lib/marking-quote";
import { prisma } from "@/lib/prisma";
import { defaultTiersFromBase, formatMoney, orderTotalCents, pickTier } from "@/lib/pricing";
import { loadActivePromotions } from "@/lib/promotions";
import { computeClientPricing } from "@/lib/product-pricing";
import { publicRef } from "@/lib/internal-ref";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calculadora pública — devuelve precio cliente final (con margen aplicado).
 * NO expone costes netos. Pensado para llamarlo desde la ficha del producto.
 *
 * Acepta DOS formatos de entrada para no romper integraciones existentes:
 *
 *   A) Legacy / 1-marca:
 *      { productSlug, quantity, techniqueCode?, numberOfColours?, positionCount?, ... }
 *
 *   B) Multi-marca (nuevo):
 *      { productSlug, quantity, markings: [
 *          { positionId, techniqueCode, numberOfColours?, printAreaCm2?, manipulationCode? },
 *          ...
 *      ] }
 *
 * Internamente B es el camino canónico; A se normaliza a un array de 1.
 */

const MarkingSchema = z.object({
  positionId: z.string().min(1).max(60).optional(),
  techniqueCode: z.string().min(1).max(40),
  numberOfColours: z.number().int().min(1).max(20).optional(),
  printAreaCm2: z.number().positive().optional(),
  manipulationCode: z.string().length(1).optional(),
});

const Schema = z.object({
  productSlug: z.string().min(1),
  quantity: z.number().int().positive().max(1_000_000),
  // legacy
  techniqueCode: z.string().optional(),
  numberOfColours: z.number().int().min(1).max(10).optional(),
  printAreaCm2: z.number().positive().optional(),
  manipulationCode: z.string().length(1).optional(),
  positionCount: z.number().int().min(1).max(10).optional(),
  // nuevo
  markings: z.array(MarkingSchema).max(10).optional(),
});

export async function POST(req: Request) {
  // Generoso: el configurador legítimo recalcula en cada cambio de cantidad.
  // Solo frena bots que machacan el cálculo de precios (protege CPU del VPS).
  const rl = rateLimit(req, { key: "quote-calculate", max: 120, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Producto + override + primera variante CON tiers (mismo criterio que la ficha).
  const product = await prisma.product.findUnique({
    where: { slug: data.productSlug },
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
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  // Precio cliente del PRODUCTO — MISMA fuente que la ficha (coste neto → margen
  // → override → promo). Antes este path ignoraba override y promociones y solo
  // el producto cambiaba de precio según el toggle de marcaje. El margen del
  // producto va aquí dentro; el del MARCAJE se aplica aparte (applyMargin) abajo.
  const variantWithTiers = product.variants[0];
  const activePromos = await loadActivePromotions();
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
  const productTier = pickTier(clientTiers, data.quantity);
  const productUnitClientCents =
    productTier?.unitPriceCents ?? clientPricing.baseCentsForEstimate ?? 0;
  const priceSource: "provider" | "estimate" = clientPricing.clientTiers ? "provider" : "estimate";

  // Normalizar a array de marcas (legacy → array de 1, multi → array tal cual)
  const markings = data.markings && data.markings.length > 0
    ? data.markings
    : data.techniqueCode
      ? [{
          techniqueCode: data.techniqueCode,
          numberOfColours: data.numberOfColours,
          printAreaCm2: data.printAreaCm2,
          manipulationCode: data.manipulationCode,
        }]
      : [];

  // Calcular cada marca por separado y agregar
  type MarkingResult = {
    positionId?: string;
    techniqueCode: string;
    techniqueName: string;
    netCostCents: number;
    clientCostCents: number;
    warning?: string;
  };
  const markingResults: MarkingResult[] = [];
  let markingNetTotalCents = 0;
  // Unitario NETO al tramo (para reglas markup % de la cascada Cifra).
  const netTierForQty = variantWithTiers
    ? pickTier(
        variantWithTiers.priceTiers.map((t) => ({
          minQty: t.minQty,
          unitPriceCents: t.unitPriceCents,
          source: "PROVIDER" as const,
        })),
        data.quantity,
      )
    : null;
  const productNetUnitCents = netTierForQty?.unitPriceCents ?? product.fromPriceCents ?? 0;
  for (const m of markings) {
    try {
      // Cascada UNIFICADA (misma que checkout y cotizador): scales reales /
      // tarifa por producto (Cifra PDF) / regla markup — nunca la escala dummy.
      const q = await quoteMarkingNet({
        productId: product.id,
        supplier: product.supplier,
        techniqueCode: m.techniqueCode,
        quantity: data.quantity,
        productNetUnitCents,
        positionCount: data.positionCount, // pasamos solo si viene en payload legacy
        printAreaCm2: m.printAreaCm2,
        numberOfColours: m.numberOfColours,
        manipulationCode: m.manipulationCode,
      });
      markingNetTotalCents += q.netTotalCents;
      markingResults.push({
        positionId: m.positionId,
        techniqueCode: m.techniqueCode,
        techniqueName: q.techniqueLabel,
        netCostCents: q.netTotalCents,
        clientCostCents: applyMargin(q.netTotalCents),
        warning: q.warning,
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Error al calcular marcaje ${m.techniqueCode}`, detail: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  // Producto cliente: subtotal (con margen/override/PERCENT ya aplicados) menos
  // el FIXED de pedido UNA sola vez. Marcaje cliente: margen sobre el coste neto.
  const productSubtotalClientCents = productUnitClientCents * data.quantity;
  const productClientCents = orderTotalCents(
    productSubtotalClientCents,
    clientPricing.orderFixedPromo,
  );
  const markingClientCents = applyMargin(markingNetTotalCents);
  const totalClientCents = productClientCents + markingClientCents;
  const clientUnitCents =
    data.quantity > 0 ? Math.round(totalClientCents / data.quantity) : 0;

  return NextResponse.json({
    ok: true,
    quantity: data.quantity,
    product: {
      slug: product.slug,
      name: product.name,
      ref: publicRef(product), // NUNCA supplierRef en endpoint público
      priceSource,
    },
    // Compatibilidad legacy: si solo había 1 marca, expongo "marking" en el shape antiguo
    marking:
      markingResults.length === 1
        ? {
            techniqueCode: markingResults[0].techniqueCode,
            techniqueName: markingResults[0].techniqueName,
            warning: markingResults[0].warning,
          }
        : null,
    // Nuevo: array completo con detalle por marca
    markings: markingResults.map((m) => ({
      positionId: m.positionId,
      techniqueCode: m.techniqueCode,
      techniqueName: m.techniqueName,
      clientCost: formatMoney(m.clientCostCents),
      warning: m.warning,
    })),
    pricing: {
      currency: "EUR",
      productClient: formatMoney(productClientCents),
      markingClient: formatMoney(markingClientCents),
      unitClient: formatMoney(clientUnitCents),
      totalClient: formatMoney(totalClientCents),
    },
    // Campo legacy (un poco diferente de markingClient pero compatible):
    clientMarkingPerUnit:
      markingNetTotalCents > 0 && data.quantity > 0
        ? formatMoney(Math.round(markingClientCents / data.quantity))
        : null,
    clientUnitPrice: formatMoney(clientUnitCents),
    clientTotal: formatMoney(totalClientCents),
    disclaimer:
      "Precio orientativo con margen comercial estándar. El presupuesto cerrado se calcula tras revisar artwork, plazo y transporte.",
  });
}
