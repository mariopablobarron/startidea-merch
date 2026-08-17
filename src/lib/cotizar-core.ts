import { prisma } from "@/lib/prisma";
import { getAvailableMarkingRules } from "@/lib/supplier-marking-rules";
import { quoteMarkingNet } from "@/lib/marking-quote";
import { validateCoupon } from "@/lib/coupons";
import { applyMargin, defaultTiersFromBase, pickTier } from "@/lib/pricing";
import { computeClientPricing } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";
import { publicProductName } from "@/lib/product-name";
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
    /** Origen de la tarifa: "rule" = aproximada (contrastar con proveedor). */
    source?: "scales" | "product-tariff" | "rule" | "none";
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

/** PVP a partir del coste neto: override marginPct o margen global (×1,6667). */
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
      categoryId: true,
      category: { select: { name: true } },
      fromPriceCents: true,
      markingTechniqueHint: true,
      markingSizeHint: true,
      primaryImageUrl: true,
      override: {
        select: {
          customName: true,
          customFromPriceCents: true,
          marginPct: true,
          marketingTags: true,
        },
      },
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
    name: publicProductName(prod.name, prod.override?.customName),
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
    | {
        techniqueCode: string;
        techniqueLabel: string;
        setupCents: number;
        totalMarkingCents: number;
        warning?: string;
        source?: "scales" | "product-tariff" | "rule" | "none";
      }
    | null = null;
  let costeMarcajeTotal = 0;

  if (!techniqueCode) {
    // Las MISMAS técnicas que ofrece la ficha pública: posiciones del producto
    // (todos los proveedores — Makito y Cifra también las tienen); el camino
    // hint+reglas queda como fallback para productos sin posiciones. Antes el
    // cotizador enrutaba todo lo no-midocean a reglas y daba 404 para técnicas
    // Makito que la ficha SÍ tarificaba (auditoría 2026-07-09, A13/M7).
    const positions = await prisma.markingPosition.findMany({
      where: { productId: prod.id },
      include: { techniques: { include: { technique: true } } },
    });
    if (positions.length > 0) {
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
  } else {
    // Cascada UNIFICADA (la misma que ficha y checkout): scales reales /
    // tarifa por producto (PDF Cifra) / regla markup. Coste NETO.
    let q;
    try {
      q = await quoteMarkingNet({
        productId: prod.id,
        supplier: prod.supplier,
        techniqueCode: techniqueCode.toUpperCase(),
        quantity: qty,
        productNetUnitCents: netUnitCents,
        numberOfColours,
        printAreaCm2,
        manipulationCode,
      });
    } catch {
      return { ok: false, status: 404, error: `Técnica "${techniqueCode}" no válida para este producto.` };
    }
    if (!q.ok) {
      return {
        ok: false,
        status: 404,
        error: `Sin tarifa de marcaje para "${techniqueCode}": ${q.warning ?? "pedir coste al proveedor"}.`,
      };
    }
    costeMarcajeTotal = q.netTotalCents;
    marking = {
      techniqueCode: techniqueCode.toUpperCase(),
      techniqueLabel: q.techniqueLabel,
      setupCents: q.setupCents,
      totalMarkingCents: q.netTotalCents,
      warning: q.warning,
      source: q.source,
    };
  }

  // ── Coste total (incl. PORTES) + PVP con margen sobre todo ──
  const costeProductoTotal = netUnitCents * qty;
  const costeTotal = costeProductoTotal + costeMarcajeTotal + portesCents;

  // PVP del producto: pipeline CANÓNICO (override + promociones), el mismo que
  // ve el cliente en la ficha. Antes se ignoraban override y promos y el
  // cotizador/las propuestas salían ~+17,6% sobre la ficha (y +60% en Adivin).
  // marginPct manual del admin sigue mandando como override explícito.
  let pvpProductoUnit: number;
  if (marginPct != null) {
    pvpProductoUnit = pvp(netUnitCents, marginPct);
  } else {
    const activePromos = await loadActivePromotions();
    const cp = computeClientPricing({
      product: {
        id: prod.id,
        name: prod.name,
        brand: prod.brand,
        categoryId: prod.categoryId,
        fromPriceCents: prod.fromPriceCents,
        category: prod.category ? { name: prod.category.name } : null,
      },
      override: prod.override
        ? {
            customFromPriceCents: prod.override.customFromPriceCents,
            marginPct: prod.override.marginPct,
            marketingTags: prod.override.marketingTags,
          }
        : null,
      providerNetTiers: tiers.map((t) => ({ minQty: t.minQty, unitPriceCents: t.unitPriceCents })),
      activePromos,
    });
    const clientTiers =
      cp.clientTiers ??
      (cp.baseCentsForEstimate ? defaultTiersFromBase(cp.baseCentsForEstimate) : []);
    pvpProductoUnit = pickTier(clientTiers, qty)?.unitPriceCents ?? pvp(netUnitCents);
  }
  const pvpProductoTotal = pvpProductoUnit * qty;
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
