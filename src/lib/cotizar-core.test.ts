import { describe, it, expect, vi, beforeEach } from "vitest";

const productFindFirst = vi.fn();
const priceTierFindMany = vi.fn();
const markingPositionFindMany = vi.fn();
const quoteMarkingNetMock = vi.fn();
const validateCouponMock = vi.fn();
const loadActivePromotionsMock = vi.fn();
const getAvailableMarkingRulesMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findFirst: (...a: unknown[]) => productFindFirst(...a) },
    priceTier: { findMany: (...a: unknown[]) => priceTierFindMany(...a) },
    markingPosition: { findMany: (...a: unknown[]) => markingPositionFindMany(...a) },
  },
}));
vi.mock("@/lib/marking-quote", () => ({
  quoteMarkingNet: (...a: unknown[]) => quoteMarkingNetMock(...a),
}));
vi.mock("@/lib/coupons", () => ({
  validateCoupon: (...a: unknown[]) => validateCouponMock(...a),
}));
vi.mock("@/lib/promotions", () => ({
  loadActivePromotions: (...a: unknown[]) => loadActivePromotionsMock(...a),
}));
vi.mock("@/lib/supplier-marking-rules", () => ({
  getAvailableMarkingRules: (...a: unknown[]) => getAvailableMarkingRulesMock(...a),
}));

import { computeCotizacion, type CotizarOk } from "./cotizar-core";
import { applyMargin } from "@/lib/pricing";
import { withIva, ivaPart } from "@/lib/iva";

/**
 * Tests de src/lib/cotizar-core.ts — `computeCotizacion` es la "fuente ÚNICA"
 * declarada de la matemática de coste/PVP/marcaje/portes/cupón. No la usa solo
 * el cotizador de admin: de ella salen también las PROPUESTAS FORMALES que se
 * envían al cliente en PDF (`cotizacionToProposalItem`), las líneas guardadas
 * en presupuestos (`save-lines`, `cart-quotes/[id]/items`), la cotización del
 * bot de Telegram y la comparativa de competencia. Ocho consumidores, cero
 * tests hasta aquí.
 *
 * Mockeamos SOLO las fronteras de datos (Prisma, la cascada de marcaje ya
 * testeada aparte en marking-quote.test.ts, la validación de cupón y las
 * promociones activas). La matemática de dinero —applyMargin, pickTier,
 * computeClientPricing, el IVA— se deja REAL, y las cifras esperadas se
 * derivan de esas mismas funciones en vez de hardcodear el ×1,6: si mañana
 * cambia el margen global, estos tests siguen fijando la RELACIÓN, no el número.
 */

type Tier = { minQty: number; unitPriceCents: number };

/** Tramos NETOS de proveedor tal y como los devuelve Prisma: minQty DESC. */
const NET_TIERS: Tier[] = [
  { minQty: 250, unitPriceCents: 180 },
  { minQty: 100, unitPriceCents: 200 },
  { minQty: 50, unitPriceCents: 240 },
  { minQty: 10, unitPriceCents: 300 },
];

function makeProduct(over?: Partial<Record<string, unknown>>) {
  return {
    id: "p1",
    supplier: "midocean",
    supplierRef: "MO-9999",
    internalRef: "STM-123",
    slug: "boligrafo-azul",
    name: "Bolígrafo azul",
    brand: null,
    categoryId: "c1",
    category: { name: "Escritura" },
    fromPriceCents: 500,
    markingTechniqueHint: null,
    markingSizeHint: null,
    primaryImageUrl: "/api/m/abc123",
    override: null,
    ...over,
  };
}

/** Estrecha el resultado a CotizarOk y falla con mensaje útil si es error. */
function expectOk(res: Awaited<ReturnType<typeof computeCotizacion>>): CotizarOk {
  if (!res.ok) throw new Error(`Se esperaba ok:true, llegó ${res.status} "${res.error}"`);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  productFindFirst.mockResolvedValue(makeProduct());
  priceTierFindMany.mockResolvedValue(NET_TIERS);
  markingPositionFindMany.mockResolvedValue([]);
  loadActivePromotionsMock.mockResolvedValue([]);
  getAvailableMarkingRulesMock.mockResolvedValue([]);
  validateCouponMock.mockResolvedValue({ ok: false, reason: "Código no válido" });
});

describe("computeCotizacion · coste y tramo de cantidad", () => {
  it("toma el tramo NETO que corresponde a la cantidad", async () => {
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100 }));
    // qty 100 → tramo minQty 100 → 200 c/ud
    expect(res.coste.productoTotal).toBe(200 * 100);
    expect(res.product.hasRealPricing).toBe(true);
  });

  it("una cantidad POR DEBAJO del tramo mínimo cae al tramo más pequeño (el más caro), nunca al más barato", async () => {
    // Invariante anti-cobrar-de-menos: 5 uds no pueden salir al precio de 250.
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 5 }));
    expect(res.coste.productoTotal).toBe(300 * 5);
    const masBarato = Math.min(...NET_TIERS.map((t) => t.unitPriceCents));
    expect(res.coste.productoTotal / 5).toBeGreaterThan(masBarato);
  });

  it("sin tramos de proveedor usa fromPriceCents y marca hasRealPricing=false", async () => {
    priceTierFindMany.mockResolvedValue([]);
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 10 }));
    expect(res.coste.productoTotal).toBe(500 * 10);
    expect(res.product.hasRealPricing).toBe(false);
  });

  it("los portes entran en el COSTE total (omitirlos infla el margen aparente)", async () => {
    const sin = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100 }));
    const con = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100, portesCents: 800 }));
    expect(con.coste.total - sin.coste.total).toBe(800);
    expect(con.coste.portesTotal).toBe(800);
  });
});

describe("computeCotizacion · PVP y margen", () => {
  it("el PVP del producto sale de la cascada canónica del cliente, no del coste a pelo", async () => {
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100 }));
    // Sin override ni promo, la cascada aplica el margen global a cada tramo neto.
    expect(res.pvp.productoTotal).toBe(applyMargin(200) * 100);
    expect(res.pvp.productoTotal).toBeGreaterThan(res.coste.productoTotal);
  });

  it("el marcaje y los portes se venden CON margen, nunca a coste", async () => {
    quoteMarkingNetMock.mockResolvedValue({
      ok: true,
      netTotalCents: 5000,
      techniqueLabel: "Serigrafía 1 color",
      setupCents: 2500,
    });
    const res = expectOk(
      await computeCotizacion({ ref: "STM-123", qty: 100, techniqueCode: "s1", portesCents: 800 }),
    );
    expect(res.pvp.marcajeTotal).toBe(applyMargin(5000));
    expect(res.pvp.marcajeTotal).toBeGreaterThan(res.coste.marcajeTotal);
    expect(res.pvp.envioTotal).toBe(applyMargin(800));
    expect(res.pvp.envioTotal).toBeGreaterThan(800);
  });

  it("marginPct del admin manda sobre la cascada (override explícito)", async () => {
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100, marginPct: 50 }));
    expect(res.pvp.productoTotal).toBe(Math.round((200 * 150) / 100) * 100);
  });

  it("marginPct=0 es margen CERO explícito, no 'sin override'", async () => {
    // Casi-cero (marginPct == null) y cero-explícito son ramas distintas: si se
    // confundieran, un 0 del admin caería en la cascada y cobraría de más.
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100, marginPct: 0 }));
    expect(res.pvp.productoTotal).toBe(res.coste.productoTotal);
    expect(res.margenEfectivoPct).toBe(0);
  });

  it("el margen efectivo se calcula contra el coste TOTAL, portes incluidos", async () => {
    const res = expectOk(
      await computeCotizacion({ ref: "STM-123", qty: 100, portesCents: 800 }),
    );
    const esperado = Math.round(((res.pvp.baseTotal - res.coste.total) / res.coste.total) * 100);
    expect(res.margenEfectivoPct).toBe(esperado);
  });
});

describe("computeCotizacion · marcaje", () => {
  it("una técnica que no existe para el producto NO se cotiza: error, nunca marcaje gratis", async () => {
    quoteMarkingNetMock.mockRejectedValue(new Error("technique not found"));
    const res = await computeCotizacion({ ref: "STM-123", qty: 100, techniqueCode: "XX" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("sin tarifa fiable de marcaje devuelve error en vez de colar el marcaje a 0 €", async () => {
    quoteMarkingNetMock.mockResolvedValue({
      ok: false,
      netTotalCents: 0,
      techniqueLabel: "DTF",
      setupCents: 0,
      warning: "Técnica sin tarifa real registrada",
    });
    const res = await computeCotizacion({ ref: "STM-123", qty: 100, techniqueCode: "DTF" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.error).toContain("Sin tarifa de marcaje");
    }
  });

  it("sin técnica pedida no hay marcaje cobrado: solo se ofrecen las opciones", async () => {
    markingPositionFindMany.mockResolvedValue([
      {
        techniques: [{ technique: { code: "S1", name: "Serigrafía", setupCents: 2500 } }],
      },
    ]);
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100 }));
    expect(res.marking).toBeUndefined();
    expect(res.coste.marcajeTotal).toBe(0);
    expect(res.techniques).toEqual([
      { techniqueCode: "S1", techniqueLabel: "Serigrafía", markupPct: 0, setupCents: 2500 },
    ]);
    expect(quoteMarkingNetMock).not.toHaveBeenCalled();
  });

  it("la técnica se normaliza a mayúsculas antes de tarificar", async () => {
    quoteMarkingNetMock.mockResolvedValue({
      ok: true,
      netTotalCents: 5000,
      techniqueLabel: "Serigrafía",
      setupCents: 2500,
    });
    await computeCotizacion({ ref: "STM-123", qty: 100, techniqueCode: "s1" });
    expect(quoteMarkingNetMock).toHaveBeenCalledWith(
      expect.objectContaining({ techniqueCode: "S1", quantity: 100, productNetUnitCents: 200 }),
    );
  });
});

describe("computeCotizacion · cupones y envío gratis", () => {
  it("el envío gratis se descuenta UNA sola vez, no dos", async () => {
    // pvpAntes ya incluye el envío; el cupón lo resta. Si además se sumara la
    // línea de envío, el desglose no cuadraría con lo que se cobra.
    validateCouponMock.mockResolvedValue({
      ok: true,
      coupon: { code: "ENVIOGRATIS", label: "Envío gratis" },
      discountCents: 0,
    });
    const res = expectOk(
      await computeCotizacion({
        ref: "STM-123",
        qty: 100,
        portesCents: 800,
        couponCode: "ENVIOGRATIS",
      }),
    );
    expect(res.envioGratis).toBe(true);
    expect(res.pvp.envioTotal).toBe(0);
    expect(res.pvp.baseTotal).toBe(res.pvp.productoTotal + res.pvp.marcajeTotal);
    expect(res.cupon).toEqual({ code: "ENVIOGRATIS", label: "Envío gratis", tipo: "envio_gratis" });
  });

  it("un cupón mayor que el total deja el precio en 0, nunca en negativo", async () => {
    validateCouponMock.mockResolvedValue({
      ok: true,
      coupon: { code: "MEGA", label: "−10.000 €" },
      discountCents: 1_000_000,
    });
    const res = expectOk(
      await computeCotizacion({ ref: "STM-123", qty: 100, couponCode: "MEGA" }),
    );
    expect(res.pvp.baseTotal).toBe(0);
    expect(res.pvp.unit).toBe(0);
    expect(res.pvp.totalConIva).toBe(0);
  });

  it("un cupón inválido NO regala nada: se cobra íntegro y se informa del error", async () => {
    validateCouponMock.mockResolvedValue({ ok: false, reason: "Código caducado" });
    const conCupon = expectOk(
      await computeCotizacion({ ref: "STM-123", qty: 100, couponCode: "CADUCADO" }),
    );
    const sinCupon = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100 }));
    expect(conCupon.cuponError).toBe("Código caducado");
    expect(conCupon.cupon).toBeNull();
    expect(conCupon.pvp.baseTotal).toBe(sinCupon.pvp.baseTotal);
    expect(conCupon.pvp.descuentoCents).toBe(0);
  });

  it("el cupón se valida contra el total CON margen, no contra el coste", async () => {
    validateCouponMock.mockResolvedValue({ ok: false, reason: "Código no válido" });
    await computeCotizacion({ ref: "STM-123", qty: 100, couponCode: "X" });
    const totalPasado = validateCouponMock.mock.calls[0]?.[1] as number;
    expect(totalPasado).toBe(applyMargin(200) * 100);
  });
});

describe("computeCotizacion · totales, IVA y exposición", () => {
  it("el IVA se suma sobre la base y el unitario cuadra con el total", async () => {
    const res = expectOk(await computeCotizacion({ ref: "STM-123", qty: 100 }));
    expect(res.pvp.ivaCents).toBe(ivaPart(res.pvp.baseTotal));
    expect(res.pvp.totalConIva).toBe(withIva(res.pvp.baseTotal));
    expect(res.pvp.totalConIva).toBe(res.pvp.baseTotal + res.pvp.ivaCents);
    expect(res.pvp.unit).toBe(Math.round(res.pvp.baseTotal / 100));
  });

  it("la referencia PÚBLICA es la nuestra, nunca la del proveedor", async () => {
    // publicRef alimenta el PDF de propuesta que recibe el cliente.
    const res = expectOk(await computeCotizacion({ ref: "MO-9999", qty: 100 }));
    expect(res.product.publicRef).toBe("STM-123");
    expect(res.product.publicRef).not.toBe(res.product.supplierRef);
  });

  it("sin internalRef la referencia pública cae al slug, no al supplierRef", async () => {
    productFindFirst.mockResolvedValue(makeProduct({ internalRef: null }));
    const res = expectOk(await computeCotizacion({ ref: "MO-9999", qty: 100 }));
    expect(res.product.publicRef).toBe("boligrafo-azul");
  });

  it("un producto inexistente o inactivo devuelve 404, no una cotización a cero", async () => {
    productFindFirst.mockResolvedValue(null);
    const res = await computeCotizacion({ ref: "NO-EXISTE", qty: 100 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("solo busca productos ACTIVOS y por cualquiera de las tres referencias", async () => {
    await computeCotizacion({ ref: "  STM-123  ", qty: 100 });
    const where = (productFindFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where.active).toBe(true);
    expect(where.OR).toEqual([
      { internalRef: "STM-123" },
      { supplierRef: "STM-123" },
      { slug: "STM-123" },
    ]);
  });
});
