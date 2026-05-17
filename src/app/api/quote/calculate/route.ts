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

  // Producto + variant principal
  const product = await prisma.product.findUnique({
    where: { slug: data.productSlug },
    include: {
      variants: { take: 1, include: { priceTiers: { orderBy: { minQty: "asc" } } } },
      category: { select: { name: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  // Coste neto unidad
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
  for (const m of markings) {
    try {
      const br = await calculateMarkingCost({
        techniqueCode: m.techniqueCode,
        quantity: data.quantity,
        positionCount: data.positionCount, // pasamos solo si viene en payload legacy
        printAreaCm2: m.printAreaCm2,
        numberOfColours: m.numberOfColours,
        manipulationCode: m.manipulationCode,
      });
      const net = br.totalCostCents ?? 0;
      markingNetTotalCents += net;
      markingResults.push({
        positionId: m.positionId,
        techniqueCode: br.techniqueCode,
        techniqueName: br.techniqueName,
        netCostCents: net,
        clientCostCents: applyMargin(net),
        warning: br.warning,
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Error al calcular marcaje ${m.techniqueCode}`, detail: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }
  }

  const productNetCostCents = netUnitCostCents * data.quantity;
  const totalNetCostCents = productNetCostCents + markingNetTotalCents;
  const totalClientCents = applyMargin(totalNetCostCents);
  const clientUnitCents = Math.round(totalClientCents / data.quantity);

  // Coste solo del producto cliente (para mostrar desglose)
  const productClientCents = applyMargin(productNetCostCents);

  return NextResponse.json({
    ok: true,
    quantity: data.quantity,
    product: {
      slug: product.slug,
      name: product.name,
      ref: product.supplierRef,
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
      markingClient: formatMoney(applyMargin(markingNetTotalCents)),
      unitClient: formatMoney(clientUnitCents),
      totalClient: formatMoney(totalClientCents),
    },
    // Campo legacy (un poco diferente de markingClient pero compatible):
    clientMarkingPerUnit:
      markingNetTotalCents > 0
        ? formatMoney(Math.round(applyMargin(markingNetTotalCents) / data.quantity))
        : null,
    clientUnitPrice: formatMoney(clientUnitCents),
    clientTotal: formatMoney(totalClientCents),
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
