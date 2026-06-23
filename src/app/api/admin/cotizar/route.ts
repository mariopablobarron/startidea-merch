import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getAvailableMarkingRules, quoteMarkingForRule } from "@/lib/supplier-marking-rules";
import { applyMargin } from "@/lib/pricing";
import { withIva, ivaPart } from "@/lib/iva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cotizar
 *
 * Cotizador rápido para administración: busca un producto por CUALQUIER
 * referencia (la nuestra internalRef/slug O la del proveedor supplierRef) y
 * devuelve NUESTRO COSTE y el PVP con margen + IVA. Marcaje vía la librería
 * unificada (agnóstica de proveedor).
 *
 * Body: { ref, qty, techniqueCode?, marginPct? }
 *   - sin techniqueCode → lista técnicas disponibles + precio sin marcaje.
 *   - con techniqueCode → cotización completa (producto + marcaje).
 *   - marginPct opcional → override del margen (60 = ×1,6). Por defecto ×1,6 global.
 */
const Schema = z.object({
  ref: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(100_000),
  techniqueCode: z.string().min(1).max(20).optional(),
  marginPct: z.number().min(0).max(900).optional(),
});

/** PVP a partir del coste neto: override marginPct o margen global (×1,6). */
function pvp(netCents: number, marginPct?: number): number {
  if (marginPct != null) return Math.round((netCents * (100 + marginPct)) / 100);
  return applyMargin(netCents);
}

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { qty, techniqueCode, marginPct } = parsed.data;
  const ref = parsed.data.ref.trim();

  // Buscar por cualquier referencia (nuestra o del proveedor)
  const product = await prisma.product.findFirst({
    where: {
      active: true,
      OR: [{ internalRef: ref }, { supplierRef: ref }, { slug: ref }],
    },
    select: {
      id: true,
      supplier: true,
      supplierRef: true,
      internalRef: true,
      slug: true,
      name: true,
      brand: true,
      fromPriceCents: true,
      markingTechniqueHint: true,
      markingSizeHint: true,
      primaryImageUrl: true,
    },
  });
  if (!product) {
    return NextResponse.json(
      { error: "No encontrado. Revisa la referencia o pide cotización manual al proveedor." },
      { status: 404 },
    );
  }

  // Coste NETO del producto al tramo de cantidad (mayor minQty <= qty)
  const tiers = await prisma.priceTier.findMany({
    where: { variant: { productId: product.id } },
    orderBy: { minQty: "desc" },
    distinct: ["minQty"],
    select: { minQty: true, unitPriceCents: true },
  });
  const tier = tiers.find((t) => qty >= t.minQty) || tiers[tiers.length - 1] || null;
  const netUnitCents = tier?.unitPriceCents || product.fromPriceCents || 0;
  const hasRealPricing = tiers.length > 0;

  // Producto para la respuesta. supplier/supplierRef SOLO uso interno (la UI no
  // los mete en el documento del cliente). publicRef = lo que ve el cliente.
  const productOut = {
    name: product.name,
    brand: product.brand,
    publicRef: product.internalRef || product.slug,
    internalRef: product.internalRef,
    slug: product.slug,
    supplier: product.supplier,
    supplierRef: product.supplierRef,
    imageUrl: product.primaryImageUrl,
    markingTechniqueHint: product.markingTechniqueHint,
    markingSizeHint: product.markingSizeHint,
    hasRealPricing,
  };

  // Sin técnica → técnicas disponibles + precio sin marcaje
  if (!techniqueCode) {
    const techniques = await getAvailableMarkingRules({
      supplier: product.supplier,
      markingTechniqueHint: product.markingTechniqueHint,
    });
    const costeTotal = netUnitCents * qty;
    const pvpUnit = pvp(netUnitCents, marginPct);
    const pvpTotal = pvpUnit * qty;
    return NextResponse.json({
      ok: true,
      product: productOut,
      qty,
      techniques,
      coste: { productoTotal: costeTotal, marcajeTotal: 0, total: costeTotal },
      margenEfectivoPct: costeTotal > 0 ? Math.round(((pvpTotal - costeTotal) / costeTotal) * 100) : 0,
      pvp: {
        productoTotal: pvpTotal,
        marcajeTotal: 0,
        baseTotal: pvpTotal,
        unit: pvpUnit,
        ivaCents: ivaPart(pvpTotal),
        totalConIva: withIva(pvpTotal),
      },
    });
  }

  // Con técnica → cotización completa (producto + marcaje)
  const marking = await quoteMarkingForRule({
    supplier: product.supplier,
    techniqueCode: techniqueCode.toUpperCase(),
    productId: product.id,
    productUnitPriceCents: netUnitCents,
    qty,
  });
  if (!marking) {
    return NextResponse.json(
      { error: `Sin regla de marcaje para "${techniqueCode}". Configúrala o pide coste al proveedor.` },
      { status: 404 },
    );
  }

  // COSTE (lo nuestro)
  const costeProductoTotal = netUnitCents * qty;
  const costeMarcajeTotal = marking.totalMarkingCents;
  const costeTotal = costeProductoTotal + costeMarcajeTotal;

  // PVP (cliente): margen sobre producto y sobre marcaje
  const pvpProductoTotal = pvp(netUnitCents, marginPct) * qty;
  const pvpMarcajeTotal = pvp(costeMarcajeTotal, marginPct);
  const pvpTotal = pvpProductoTotal + pvpMarcajeTotal;

  return NextResponse.json({
    ok: true,
    product: productOut,
    qty,
    marking: {
      techniqueCode: marking.techniqueCode,
      techniqueLabel: marking.techniqueLabel,
      setupCents: marking.setupCents,
      totalMarkingCents: marking.totalMarkingCents,
    },
    coste: { productoTotal: costeProductoTotal, marcajeTotal: costeMarcajeTotal, total: costeTotal },
    margenEfectivoPct: costeTotal > 0 ? Math.round(((pvpTotal - costeTotal) / costeTotal) * 100) : 0,
    pvp: {
      productoTotal: pvpProductoTotal,
      marcajeTotal: pvpMarcajeTotal,
      baseTotal: pvpTotal,
      unit: Math.round(pvpTotal / qty),
      ivaCents: ivaPart(pvpTotal),
      totalConIva: withIva(pvpTotal),
    },
  });
}
