import { prisma } from "@/lib/prisma";
import { getAvailableMarkingRules, quoteMarkingForRule } from "@/lib/supplier-marking-rules";
import { calculateMarkingCost } from "@/lib/marking-cost";
import { validateCoupon } from "@/lib/coupons";
import { applyMargin } from "@/lib/pricing";
import { withIva, ivaPart } from "@/lib/iva";

/**
 * Núcleo de cálculo del cotizador rápido. Fuente ÚNICA de la matemática de
 * coste/PVP/marcaje/portes/cupón — la usan tanto el endpoint del cotizador
 * (/api/admin/cotizar) como el de propuesta formal
 * (/api/admin/cotizar/proposal), para que el presupuesto y la propuesta
 * cuenten SIEMPRE el mismo dinero.
 */

export type CotizarInput = {
  ref: string;
  qty: number;
  techniqueCode?: string;
  marginPct?: number;
  numberOfColours?: number;
  printAreaCm2?: number;
  manipulationCode?: string;
  portesCents?: number;
  couponCode?: string;
};

export type TechniqueOpt = {
  techniqueCode: string;
  techniqueLabel: string;
  markupPct: number;
  setupCents: number | null;
};

export type CotizarProduct = {
  name: string;
  brand: string | null;
  publicRef: string;
  internalRef: string | null;
  slug: string;
  supplier: string;
  supplierRef: string;
  imageUrl: string | null;
  markingTechniqueHint: string | null;
  markingSizeHint: string | null;
  hasRealPricing: boolean;
};

export type CotizarOk = {
  ok: true;
  product: CotizarProduct;
  qty: number;
  portesCents: number;
  techniques?: TechniqueOpt[];
  marking?: {
    techniqueCode: string;
    techniqueLabel: string;
    setupCents: number;
    totalMarkingCents: number;
    warning?: string;
  };
  coste: { productoTotal: number; marcajeTotal: number; portesTotal: number; total: number };
  margenEfectivoPct: number;
  cupon: { code: string; label: string; tipo: string; discountCents?: number } | null;
  cuponError: string | null;
  envioGratis: boolean;
  pvp: {
    productoTotal: number;
    marcajeTotal: number;
    envioTotal: number;
    descuentoCents: number;
    baseTotal: number;
    unit: number;
    ivaCents: number;
    totalConIva: number;
  };
};

export type CotizarErr = { ok: false; status: number; error: string };
export type CotizarResult = CotizarOk | CotizarErr;

/** PVP a partir del coste neto: override marginPct o margen global (×1,6). */
function pvp(netCents: number, marginPct?: number): number {
  if (marginPct != null) return Math.round((netCents * (100 + marginPct)) / 100);
  return applyMargin(netCents);
}

export async function computeCotizacion(input: CotizarInput): Promise<CotizarResult> {
  const { qty, techniqueCode, marginPct, numberOfColours, printAreaCm2, manipulationCode } = input;
  const portesCents = input.portesCents ?? 0;
  const couponCode = input.couponCode?.trim();
  const ref = input.ref.trim();

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
    return {
      ok: false,
      status: 404,
      error: "No encontrado. Revisa la referencia o pide cotización manual al proveedor.",
    };
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

  const productOut: CotizarProduct = {
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
  let marking:
    | { techniqueCode: string; techniqueLabel: string; setupCents: number; totalMarkingCents: number; warning?: string }
    | null = null;
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
      return { ok: false, status: 404, error: `Técnica "${techniqueCode}" no válida para este producto.` };
    }
    costeMarcajeTotal = mc.totalCostCents;
    marking = {
      techniqueCode: techniqueCode.toUpperCase(),
      techniqueLabel: mc.techniqueName,
      setupCents: mc.setupCents,
      totalMarkingCents: mc.totalCostCents,
      warning: mc.warning,
    };
  } else {
    const m = await quoteMarkingForRule({
      supplier: prod.supplier,
      techniqueCode: techniqueCode.toUpperCase(),
      productId: prod.id,
      productUnitPriceCents: netUnitCents,
      qty,
    });
    if (!m) {
      return {
        ok: false,
        status: 404,
        error: `Sin regla de marcaje para "${techniqueCode}". Configúrala o pide coste al proveedor.`,
      };
    }
    costeMarcajeTotal = m.totalMarkingCents;
    marking = {
      techniqueCode: techniqueCode.toUpperCase(),
      techniqueLabel: m.techniqueLabel,
      setupCents: m.setupCents,
      totalMarkingCents: m.totalMarkingCents,
    };
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

  return {
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
  };
}
