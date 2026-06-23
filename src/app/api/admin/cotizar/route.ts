import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getAvailableMarkingRules, quoteMarkingForRule } from "@/lib/supplier-marking-rules";
import { calculateMarkingCost } from "@/lib/marking-cost";
import { validateCoupon } from "@/lib/coupons";
import { applyMargin } from "@/lib/pricing";
import { withIva, ivaPart } from "@/lib/iva";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cotizar
 *
 * Cotizador rápido admin: busca un producto por CUALQUIER referencia (la nuestra
 * internalRef/slug O la del proveedor supplierRef) y devuelve NUESTRO COSTE y el
 * PVP con margen + IVA.
 *
 *   coste = producto (PriceTier) + marcaje + PORTES (coste proveedor, editable)
 *   PVP   = coste × margen (×1,6 o marginPct) → el margen incluye los portes
 *   cupón = si se pasa couponCode, se valida; si es de ENVÍO GRATIS, el envío
 *           sale a 0 al cliente; si es % / fijo, se descuenta del total.
 *
 * Marcaje: MidOcean vía MarkingPosition + calculateMarkingCost; resto vía
 * SupplierMarkingRule.
 *
 * Body: { ref, qty, techniqueCode?, marginPct?, numberOfColours?, printAreaCm2?,
 *         manipulationCode?, portesCents?, couponCode? }
 */
const Schema = z.object({
  ref: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(100_000),
  techniqueCode: z.string().min(1).max(20).optional(),
  marginPct: z.number().min(0).max(900).optional(),
  numberOfColours: z.number().int().min(1).max(12).optional(),
  printAreaCm2: z.number().min(0).max(100_000).optional(),
  manipulationCode: z.string().min(1).max(2).optional(),
  portesCents: z.number().int().min(0).max(1_000_000).optional(),
  couponCode: z.string().min(1).max(40).optional(),
});

type TechniqueOpt = {
  techniqueCode: string;
  techniqueLabel: string;
  markupPct: number;
  setupCents: number | null;
};

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
  const { qty, techniqueCode, marginPct, numberOfColours, printAreaCm2, manipulationCode } = parsed.data;
  const portesCents = parsed.data.portesCents ?? 0;
  const couponCode = parsed.data.couponCode?.trim();
  const ref = parsed.data.ref.trim();

  const product = await prisma.product.findFirst({
    where: { active: true, OR: [{ internalRef: ref }, { supplierRef: ref }, { slug: ref }] },
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
  const prod = product; // narrowing no-nulo estable
  const isMidocean = prod.supplier === "midocean";

  // Coste NETO del producto al tramo de cantidad
  const tiers = await prisma.priceTier.findMany({
    where: { variant: { productId: prod.id } },
    orderBy: { minQty: "desc" },
    distinct: ["minQty"],
    select: { minQty: true, unitPriceCents: true },
  });
  const tier = tiers.find((t) => qty >= t.minQty) || tiers[tiers.length - 1] || null;
  const netUnitCents = tier?.unitPriceCents || prod.fromPriceCents || 0;

  const productOut = {
    name: prod.name,
    brand: prod.brand,
    publicRef: prod.internalRef || prod.slug,
    internalRef: prod.internalRef,
    slug: prod.slug,
    supplier: prod.supplier,
    supplierRef: prod.supplierRef,
    imageUrl: prod.primaryImageUrl,
    markingTechniqueHint: prod.markingTechniqueHint,
    markingSizeHint: prod.markingSizeHint,
    hasRealPricing: tiers.length > 0,
  };

  // ── Marcaje ──
  let techniques: TechniqueOpt[] | null = null;
  let marking: { techniqueCode: string; techniqueLabel: string; setupCents: number; totalMarkingCents: number; warning?: string } | null = null;
  let costeMarcajeTotal = 0;

  if (!techniqueCode) {
    if (isMidocean) {
      const positions = await prisma.markingPosition.findMany({
        where: { productId: prod.id },
        include: { techniques: { include: { technique: true } } },
      });
      const byCode = new Map<string, TechniqueOpt>();
      for (const pos of positions) {
        for (const t of pos.techniques) {
          if (!byCode.has(t.technique.code)) {
            byCode.set(t.technique.code, {
              techniqueCode: t.technique.code,
              techniqueLabel: t.technique.name,
              markupPct: 0,
              setupCents: t.technique.setupCents ?? null,
            });
          }
        }
      }
      techniques = Array.from(byCode.values());
    } else {
      techniques = await getAvailableMarkingRules({
        supplier: prod.supplier,
        markingTechniqueHint: prod.markingTechniqueHint,
      });
    }
  } else if (isMidocean) {
    let mc;
    try {
      mc = await calculateMarkingCost({
        techniqueCode: techniqueCode.toUpperCase(),
        quantity: qty,
        numberOfColours,
        printAreaCm2,
        manipulationCode,
      });
    } catch {
      return NextResponse.json({ error: `Técnica "${techniqueCode}" no válida para este producto.` }, { status: 404 });
    }
    costeMarcajeTotal = mc.totalCostCents;
    marking = { techniqueCode: techniqueCode.toUpperCase(), techniqueLabel: mc.techniqueName, setupCents: mc.setupCents, totalMarkingCents: mc.totalCostCents, warning: mc.warning };
  } else {
    const m = await quoteMarkingForRule({
      supplier: prod.supplier,
      techniqueCode: techniqueCode.toUpperCase(),
      productId: prod.id,
      productUnitPriceCents: netUnitCents,
      qty,
    });
    if (!m) {
      return NextResponse.json({ error: `Sin regla de marcaje para "${techniqueCode}". Configúrala o pide coste al proveedor.` }, { status: 404 });
    }
    costeMarcajeTotal = m.totalMarkingCents;
    marking = { techniqueCode: techniqueCode.toUpperCase(), techniqueLabel: m.techniqueLabel, setupCents: m.setupCents, totalMarkingCents: m.totalMarkingCents };
  }

  // ── Coste total (incl. PORTES) + PVP con margen sobre todo ──
  const costeProductoTotal = netUnitCents * qty;
  const costeTotal = costeProductoTotal + costeMarcajeTotal + portesCents;

  const pvpProductoTotal = pvp(netUnitCents, marginPct) * qty;
  const pvpMarcajeTotal = pvp(costeMarcajeTotal, marginPct);
  const pvpEnvio = pvp(portesCents, marginPct);
  const pvpAntes = pvpProductoTotal + pvpMarcajeTotal + pvpEnvio;

  // ── Cupón / envío gratis ──
  let descuentoCents = 0;
  let envioGratis = false;
  let cupon: { code: string; label: string; tipo: string; discountCents?: number } | null = null;
  let cuponError: string | null = null;
  if (couponCode) {
    const v = await validateCoupon(couponCode, pvpAntes);
    if (!v.ok) {
      cuponError = v.reason;
    } else {
      const c = v.coupon;
      const code = c.code.toUpperCase();
      const freeShip = code.startsWith("RUL-ENVIO") || code === "ENVIOGRATIS" || /env[íi]o\s*gratis/i.test(c.label);
      if (freeShip) {
        envioGratis = true;
        descuentoCents = pvpEnvio; // el cliente no paga el envío
        cupon = { code: c.code, label: c.label, tipo: "envio_gratis" };
      } else {
        descuentoCents = v.discountCents;
        cupon = { code: c.code, label: c.label, tipo: "descuento", discountCents: v.discountCents };
      }
    }
  }
  const pvpBase = Math.max(0, pvpAntes - descuentoCents);

  return NextResponse.json({
    ok: true,
    product: productOut,
    qty,
    portesCents,
    ...(techniques ? { techniques } : {}),
    ...(marking ? { marking } : {}),
    coste: {
      productoTotal: costeProductoTotal,
      marcajeTotal: costeMarcajeTotal,
      portesTotal: portesCents,
      total: costeTotal,
    },
    margenEfectivoPct: costeTotal > 0 ? Math.round(((pvpBase - costeTotal) / costeTotal) * 100) : 0,
    cupon,
    cuponError,
    envioGratis,
    pvp: {
      productoTotal: pvpProductoTotal,
      marcajeTotal: pvpMarcajeTotal,
      envioTotal: envioGratis ? 0 : pvpEnvio,
      descuentoCents,
      baseTotal: pvpBase,
      unit: Math.round(pvpBase / qty),
      ivaCents: ivaPart(pvpBase),
      totalConIva: withIva(pvpBase),
    },
  });
}
