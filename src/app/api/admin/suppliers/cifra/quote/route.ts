import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import {
  getAvailableMarkingRules,
  quoteMarkingForRule,
} from "@/lib/supplier-marking-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  // Acepta model (rootmodel cifra, ej "10991") O slug interno
  model: z.string().min(1).max(60).optional(),
  slug: z.string().min(1).max(120).optional(),
  techniqueCode: z.string().min(1).max(10).optional(),
  qty: z.number().int().min(1).max(100_000),
});

/**
 * POST /api/admin/suppliers/cifra/quote
 *
 * Cotizador rápido para Cifra. Resuelve por `model` (cifra rootmodel) o `slug`.
 * Si no se pasa `techniqueCode`, devuelve TODAS las técnicas disponibles
 * para ese producto (cruzando hint × SupplierMarkingRule).
 *
 * Si se pasa `techniqueCode`, devuelve cotización detallada de marcaje +
 * precio producto + total (cantidad solicitada).
 *
 * Body:
 *   { model?: "10991", slug?: "neceser-kate", techniqueCode?: "F", qty: 500 }
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  if (!d.model && !d.slug) {
    return NextResponse.json({ error: "Pasa model o slug" }, { status: 400 });
  }

  // Resolver producto
  const product = await prisma.product.findFirst({
    where: {
      supplier: "cifra",
      ...(d.model ? { supplierRef: d.model } : {}),
      ...(d.slug ? { slug: d.slug } : {}),
    },
    select: {
      id: true,
      slug: true,
      supplierRef: true,
      name: true,
      fromPriceCents: true,
      markingTechniqueHint: true,
      markingSizeHint: true,
    },
  });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  // Precio producto al tier solicitado (cogemos el más alto MinQty <= qty)
  const tiers = await prisma.priceTier.findMany({
    where: { variant: { productId: product.id } },
    orderBy: { minQty: "desc" },
    distinct: ["minQty"],
    select: { minQty: true, unitPriceCents: true },
  });
  const productTier = tiers.find((t) => d.qty >= t.minQty) || tiers[tiers.length - 1] || null;
  const productUnitPriceCents = productTier?.unitPriceCents || product.fromPriceCents || 0;

  // Si no se pasa techniqueCode, listar disponibles
  if (!d.techniqueCode) {
    const techniques = await getAvailableMarkingRules({
      supplier: "cifra",
      markingTechniqueHint: product.markingTechniqueHint,
    });
    // ¿Tiene tarifa REAL del PDF?
    const hasRealPricing = await prisma.productMarkingPrice.findUnique({
      where: { productId_mode: { productId: product.id, mode: "ONE_COLOR" } },
      select: { id: true },
    });
    return NextResponse.json({
      ok: true,
      product: {
        slug: product.slug,
        ref: product.supplierRef,
        name: product.name,
        markingTechniqueHint: product.markingTechniqueHint,
        markingSizeHint: product.markingSizeHint,
        hasRealPricing: !!hasRealPricing,
      },
      qty: d.qty,
      productUnitPriceCents,
      productTotalCents: productUnitPriceCents * d.qty,
      techniques,
    });
  }

  // Cotización completa
  const marking = await quoteMarkingForRule({
    supplier: "cifra",
    techniqueCode: d.techniqueCode.toUpperCase(),
    productId: product.id,
    productUnitPriceCents,
    qty: d.qty,
  });
  if (!marking) {
    return NextResponse.json(
      {
        error: `No hay regla activa para técnica ${d.techniqueCode}. Crea una en /admin/suppliers/cifra/marking-rates.`,
      },
      { status: 404 },
    );
  }

  const productTotalCents = productUnitPriceCents * d.qty;
  const grandTotalCents = productTotalCents + marking.totalMarkingCents;

  return NextResponse.json({
    ok: true,
    product: {
      slug: product.slug,
      ref: product.supplierRef,
      name: product.name,
    },
    qty: d.qty,
    productUnitPriceCents,
    productTotalCents,
    marking,
    grandTotalCents,
    // Precio unitario "todo incluido" (con marcaje y setup distribuido)
    unitTotalCents: Math.round(grandTotalCents / d.qty),
  });
}
