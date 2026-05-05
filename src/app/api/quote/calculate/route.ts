import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateMarkingCost, applyMargin } from "@/lib/marking-cost";
import { prisma } from "@/lib/prisma";
import { defaultTiersFromBase, estimateBaseCentsFromName, formatMoney, pickTier } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calculadora pública — devuelve precio cliente final (con margen aplicado).
 * NO expone costes netos. Pensado para llamarlo desde la ficha del producto.
 */

const Schema = z.object({
  productSlug: z.string().min(1),
  quantity: z.number().int().positive().max(1_000_000),
  techniqueCode: z.string().optional(),
  numberOfColours: z.number().int().min(1).max(10).optional(),
  printAreaCm2: z.number().positive().optional(),
  manipulationCode: z.string().length(1).optional(),
  positionCount: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: Request) {
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

  // 1) Producto + variant principal con priceTiers
  const product = await prisma.product.findUnique({
    where: { slug: data.productSlug },
    include: {
      variants: {
        take: 1,
        include: { priceTiers: { orderBy: { minQty: "asc" } } },
      },
      category: { select: { name: true } },
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  // 2) Coste neto del producto/ud (proveedor o estimate)
  const variant = product.variants[0];
  let netUnitCostCents = 0;
  let priceSource: "provider" | "estimate" = "estimate";
  if (variant?.priceTiers?.length) {
    const tier = pickPriceTier(variant.priceTiers, data.quantity);
    if (tier) {
      netUnitCostCents = tier.unitPriceCents;
      priceSource = "provider";
    }
  }
  if (netUnitCostCents === 0) {
    const baseCents = estimateBaseCentsFromName(product.name, product.category?.name);
    const tier = pickTier(defaultTiersFromBase(baseCents), data.quantity);
    netUnitCostCents = tier?.unitPriceCents ?? baseCents;
  }

  // 3) Coste de marcaje (si llega técnica)
  let markingBreakdown: Awaited<ReturnType<typeof calculateMarkingCost>> | null = null;
  if (data.techniqueCode) {
    try {
      markingBreakdown = await calculateMarkingCost({
        techniqueCode: data.techniqueCode,
        quantity: data.quantity,
        positionCount: data.positionCount,
        printAreaCm2: data.printAreaCm2,
        numberOfColours: data.numberOfColours,
        manipulationCode: data.manipulationCode,
      });
    } catch (e) {
      return NextResponse.json(
        { error: "Error al calcular marcaje", detail: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  const productNetCostCents = netUnitCostCents * data.quantity;
  const markingNetCostCents = markingBreakdown?.totalCostCents ?? 0;
  const totalNetCostCents = productNetCostCents + markingNetCostCents;
  const totalClientCents = applyMargin(totalNetCostCents);

  // Precio unitario al cliente (incluye marcaje prorrateado)
  const clientUnitCents = Math.round(totalClientCents / data.quantity);

  return NextResponse.json({
    ok: true,
    quantity: data.quantity,
    product: {
      slug: product.slug,
      name: product.name,
      ref: product.supplierRef,
      priceSource, // "provider" o "estimate"
    },
    marking: markingBreakdown
      ? {
          techniqueCode: markingBreakdown.techniqueCode,
          techniqueName: markingBreakdown.techniqueName,
          warning: markingBreakdown.warning,
        }
      : null,
    pricing: {
      currency: "EUR",
      unitClient: formatMoney(clientUnitCents),
      totalClient: formatMoney(totalClientCents),
      // No exponemos costes netos
    },
    disclaimer:
      "Precio orientativo con margen comercial estándar. El presupuesto cerrado se calcula tras revisar artwork, plazo y transporte.",
  });
}

function pickPriceTier<T extends { minQty: number }>(tiers: T[], qty: number): T | undefined {
  if (!tiers.length) return undefined;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen = sorted[0];
  for (const t of sorted) if (qty >= t.minQty) chosen = t;
  return chosen;
}
