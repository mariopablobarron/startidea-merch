import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/admin-auth";
import {
  parseClientBrief,
  matchProductByHint,
  resolveTechniqueForProduct,
  type BriefLine,
  type MatchedProduct,
} from "@/lib/quote-ai-builder";
import { calculateMarkingCost, applyMargin } from "@/lib/marking-cost";
import { prisma } from "@/lib/prisma";
import { defaultTiersFromBase, estimateBaseCentsFromName, pickTier } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({
  brief: z.string().min(10).max(5000),
});

type GeneratedLine = {
  productHint: string;
  matched: {
    slug: string;
    name: string;
    productRef: string;
    primaryImageUrl: string | null;
    category: string | null;
  } | null;
  alternatives: MatchedProduct[];
  technique: {
    code: string;
    name: string;
    positionId: string;
  } | null;
  numberOfColours: number;
  variants: Array<{ size: string | null; qty: number }>;
  totalQty: number;
  unitPriceCents: number | null;
  totalPriceCents: number | null;
  notes?: string;
  error?: string;
};

/**
 * Genera presupuesto a partir de brief libre del cliente.
 *
 * Flujo:
 *  1. IA parsea el brief en líneas estructuradas (parseClientBrief).
 *  2. Para cada línea: matchProductByHint + resolveTechniqueForProduct.
 *  3. Calcula precio con calculateMarkingCost + applyMargin si hay
 *     técnica, o tiers de variante si no hay marcaje.
 *  4. Devuelve presupuesto completo para que admin revise antes de
 *     guardar como CartQuote.
 *
 * El admin valida, edita si quiere, y luego dispara /save-as-cart-quote
 * para persistir + opcionalmente enviar al cliente.
 */
export async function POST(req: Request) {
  const auth = await requireRole(req, "COMERCIAL");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Brief inválido" }, { status: 400 });

  // Paso 1: parsear con IA
  const parseRes = await parseClientBrief(parsed.data.brief);
  if (!parseRes.ok) return NextResponse.json({ error: `Parser IA: ${parseRes.error}` }, { status: 502 });
  const brief = parseRes.brief;

  // Paso 2 + 3: matching y cálculo por cada línea
  const lines: GeneratedLine[] = [];
  let grandTotalCents = 0;
  let allOk = true;

  for (const line of brief.lines) {
    const generated = await processLine(line);
    lines.push(generated);
    if (generated.totalPriceCents != null) grandTotalCents += generated.totalPriceCents;
    if (!generated.matched || generated.totalPriceCents == null) allOk = false;
  }

  return NextResponse.json({
    ok: true,
    parsed: brief,
    lines,
    grandTotalCents,
    currency: "EUR",
    allLinesResolved: allOk,
  });
}

async function processLine(line: BriefLine): Promise<GeneratedLine> {
  const totalQty = line.totalQty || line.variants.reduce((s, v) => s + v.qty, 0);
  const base: GeneratedLine = {
    productHint: line.productHint,
    matched: null,
    alternatives: [],
    technique: null,
    numberOfColours: line.numberOfColours || 1,
    variants: line.variants,
    totalQty,
    unitPriceCents: null,
    totalPriceCents: null,
    notes: line.notes,
  };

  if (totalQty === 0) {
    base.error = "Cantidad 0";
    return base;
  }

  // Match producto
  const matches = await matchProductByHint(line.productHint, line.colorHint);
  if (matches.length === 0) {
    base.error = `No se encontró producto para "${line.productHint}"`;
    return base;
  }
  const primary = matches[0];
  base.matched = {
    slug: primary.slug,
    name: primary.name,
    productRef: primary.productRef,
    primaryImageUrl: primary.primaryImageUrl,
    category: primary.category,
  };
  base.alternatives = matches.slice(1);

  // Resolver técnica
  const tech = await resolveTechniqueForProduct(primary.id, line.technique);
  if (tech) {
    base.technique = { code: tech.techniqueCode, name: tech.techniqueName, positionId: tech.positionId };
  }

  // Calcular precio: si hay técnica, usar calculateMarkingCost + margen
  // Si no, usar tiers de la primera variante
  try {
    const product = await prisma.product.findUnique({
      where: { id: primary.id },
      include: {
        variants: { include: { priceTiers: { orderBy: { minQty: "asc" } } } },
        override: true,
        category: { select: { name: true } },
      },
    });
    if (!product) {
      base.error = "Producto desapareció";
      return base;
    }

    // Coste neto producto/ud (tiers proveedor o estimate)
    const variantWithTiers = product.variants.find((v) => v.priceTiers.length > 0);
    let netUnitCostCents = 0;
    if (variantWithTiers?.priceTiers.length) {
      const tiers = variantWithTiers.priceTiers.map((t) => ({
        minQty: t.minQty,
        unitPriceCents: t.unitPriceCents,
      }));
      const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
      let chosen = sorted[0];
      for (const t of sorted) if (totalQty >= t.minQty) chosen = t;
      netUnitCostCents = chosen.unitPriceCents;
    }
    if (netUnitCostCents === 0) {
      const baseCents =
        product.override?.customFromPriceCents ??
        estimateBaseCentsFromName(product.name, product.category?.name);
      const tier = pickTier(defaultTiersFromBase(baseCents), totalQty);
      netUnitCostCents = tier?.unitPriceCents ?? baseCents;
    }

    const productNetCostCents = netUnitCostCents * totalQty;

    // Coste marcaje neto si hay técnica
    let markingNetCostCents = 0;
    let markingWarning: string | undefined;
    if (tech) {
      try {
        const marking = await calculateMarkingCost({
          techniqueCode: tech.techniqueCode,
          quantity: totalQty,
          numberOfColours: base.numberOfColours,
          positionCount: 1,
        });
        markingNetCostCents = marking.totalCostCents;
        markingWarning = marking.warning;
      } catch (e) {
        markingWarning = e instanceof Error ? e.message : "Marcaje fallo";
      }
    }

    const totalNetCostCents = productNetCostCents + markingNetCostCents;
    const totalClientCents = applyMargin(totalNetCostCents);
    base.unitPriceCents = Math.round(totalClientCents / Math.max(1, totalQty));
    base.totalPriceCents = totalClientCents;
    if (markingWarning) base.error = `Marcaje: ${markingWarning}`;
  } catch (err) {
    base.error = err instanceof Error ? err.message : "Error calculando precio";
  }

  return base;
}
