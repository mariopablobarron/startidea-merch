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
import { applyMargin } from "@/lib/marking-cost";
import { quoteMarkingNet } from "@/lib/marking-quote";
import { prisma } from "@/lib/prisma";
import { defaultTiersFromBase, pickTier } from "@/lib/pricing";
import { computeClientPricing } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";

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

    // Precio CLIENTE del producto — pipeline CANÓNICO (override + promos),
    // el mismo que la ficha. Antes usaba customFromPriceCents como si fuera
    // COSTE y aplicaba ×1,6 encima → doble margen en los 59 Adivin (+60%),
    // e ignoraba promociones para el resto (auditoría 2026-07-09, A15).
    const variantWithTiers = product.variants.find((v) => v.priceTiers.length > 0);
    const providerNetTiers = variantWithTiers?.priceTiers.map((t) => ({
      minQty: t.minQty,
      unitPriceCents: t.unitPriceCents,
    }));
    const activePromos = await loadActivePromotions();
    const cp = computeClientPricing({
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
      providerNetTiers,
      activePromos,
    });
    const clientTiers =
      cp.clientTiers ??
      (cp.baseCentsForEstimate ? defaultTiersFromBase(cp.baseCentsForEstimate) : []);
    const productUnitClientCents =
      pickTier(clientTiers, totalQty)?.unitPriceCents ?? cp.baseCentsForEstimate ?? 0;

    // Marcaje: cascada unificada; margen SOLO sobre el neto del marcaje.
    let markingClientCents = 0;
    let markingWarning: string | undefined;
    if (tech) {
      try {
        const netTier = providerNetTiers
          ? pickTier(
              providerNetTiers.map((t) => ({ ...t, source: "PROVIDER" as const })),
              totalQty,
            )
          : null;
        const q = await quoteMarkingNet({
          productId: product.id,
          supplier: product.supplier,
          techniqueCode: tech.techniqueCode,
          quantity: totalQty,
          productNetUnitCents: netTier?.unitPriceCents ?? product.fromPriceCents ?? 0,
          numberOfColours: base.numberOfColours,
          positionCount: 1,
        });
        markingClientCents = applyMargin(q.netTotalCents);
        markingWarning = q.warning;
      } catch (e) {
        markingWarning = e instanceof Error ? e.message : "Marcaje fallo";
      }
    }

    const totalClientCents = productUnitClientCents * totalQty + markingClientCents;
    base.unitPriceCents = Math.round(totalClientCents / Math.max(1, totalQty));
    base.totalPriceCents = totalClientCents;
    if (markingWarning) base.error = `Marcaje: ${markingWarning}`;
  } catch (err) {
    base.error = err instanceof Error ? err.message : "Error calculando precio";
  }

  return base;
}
