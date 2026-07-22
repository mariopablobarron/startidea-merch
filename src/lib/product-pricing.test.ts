import { describe, it, expect, beforeAll } from "vitest";
import type { Promotion } from "@prisma/client";
import { applyMargin, orderTotalCents, pickTier } from "./pricing";
import {
  adminOverridesPrice,
  clientFromPriceCents,
  computeClientPricing,
  displayFromPrice,
} from "./product-pricing";

// Margen determinista para los tests (1,6× = +60%).
beforeAll(() => {
  process.env.MARGIN_MULTIPLIER = "1.6";
});

function promo(overrides: Partial<Promotion>): Promotion {
  return {
    id: "promo-1",
    name: "Rebaja",
    slug: "rebaja",
    description: null,
    kind: "PERCENT",
    value: 10,
    scope: "ALL",
    targetIds: [],
    startsAt: new Date("2026-01-01T00:00:00Z"),
    endsAt: null,
    active: true,
    badgeText: null,
    badgeColor: null,
    displayInList: true,
    appliedCount: 0,
    viewCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    createdBy: null,
    ...overrides,
  } as Promotion;
}

// Merch BARATO (bolígrafo): coste neto 0,30 €. Es el caso donde el bug del
// FIXED por unidad ponía todo el pedido a 0.
const pen = {
  id: "pen",
  name: "Bolígrafo",
  brand: null,
  categoryId: "cat-pens",
  fromPriceCents: 30, // neto
};
// Tiers NETOS del proveedor (×1,6 margen → 80 / 48 cliente).
const penNetTiers = [
  { minQty: 10, unitPriceCents: 50 },
  { minQty: 100, unitPriceCents: 30 },
];

/** Replica el total que muestra el carrito sin marcaje (ProductOrderForm). */
function displayedCartTotal(
  clientTiers: Array<{ minQty: number; unitPriceCents: number; source: "PROVIDER" | "ESTIMATE" }> | undefined,
  qty: number,
  orderFixedPromo: { value: number } | null,
): number | null {
  if (!clientTiers) return null;
  const tier = pickTier(clientTiers, qty);
  if (!tier) return null;
  return orderTotalCents(tier.unitPriceCents * qty, orderFixedPromo);
}

describe("margen — la web pública muestra coste NETO × margen", () => {
  it("sin override ni promo, los tiers cliente = neto × 1,6", () => {
    const cp = computeClientPricing({
      product: pen,
      override: null,
      providerNetTiers: penNetTiers,
      activePromos: [],
    });
    expect(cp.clientTiers?.map((t) => t.unitPriceCents)).toEqual([80, 48]);
    expect(cp.fromPriceCents).toBe(48); // applyMargin(30)
    expect(cp.orderFixedPromo).toBeNull();
  });
});

describe("FIXED promo sobre tiers + total de carrito (regresión del bug)", () => {
  const fixed5eur = promo({ kind: "FIXED", value: 500 }); // −5 €

  it("NO toca el precio unitario de los tiers (no los pone a 0)", () => {
    const cp = computeClientPricing({
      product: pen,
      override: null,
      providerNetTiers: penNetTiers,
      activePromos: [fixed5eur],
    });
    expect(cp.clientTiers?.map((t) => t.unitPriceCents)).toEqual([80, 48]);
    expect(cp.orderFixedPromo?.value).toBe(500);
  });

  it("el total del carrito descuenta 5 € UNA vez, no 5 € × cantidad", () => {
    const cp = computeClientPricing({
      product: pen,
      override: null,
      providerNetTiers: penNetTiers,
      activePromos: [fixed5eur],
    });
    // 250 uds → tier de 100+ = 48 c/ud → subtotal 12000 c (120 €).
    const total = displayedCartTotal(cp.clientTiers, 250, cp.orderFixedPromo);
    expect(total).toBe(12000 - 500); // 11500 c = 115 €
    // El bug antiguo daba 0 (12000 − 250×500 < 0) o producto gratis.
    expect(total).not.toBe(0);
  });

  it("no deja el pedido gratis aunque el descuento supere algún precio unitario", () => {
    const cp = computeClientPricing({
      product: pen,
      override: null,
      providerNetTiers: penNetTiers,
      activePromos: [fixed5eur],
    });
    const total = displayedCartTotal(cp.clientTiers, 10, cp.orderFixedPromo);
    // 10 uds × 80 c = 800 c; −500 → 300 c. Positivo, no gratis.
    expect(total).toBe(300);
  });
});

describe("PERCENT promo — se hornea por unidad y escala con la cantidad", () => {
  const pct25 = promo({ kind: "PERCENT", value: 25 });

  it("tiers descontados y SIN descuento de pedido (no acumula)", () => {
    const cp = computeClientPricing({
      product: pen,
      override: null,
      providerNetTiers: penNetTiers,
      activePromos: [pct25],
    });
    expect(cp.clientTiers?.map((t) => t.unitPriceCents)).toEqual([60, 36]); // 80→60, 48→36
    expect(cp.orderFixedPromo).toBeNull();
    expect(cp.fromPriceCents).toBe(36);
    const total = displayedCartTotal(cp.clientTiers, 250, cp.orderFixedPromo);
    expect(total).toBe(36 * 250);
  });
});

describe("override de precio — descarta tiers de proveedor, sin doble margen", () => {
  it("customFromPriceCents = tarifa PLANA exacta (sin curva sintética bajo coste)", () => {
    const cp = computeClientPricing({
      product: pen,
      override: { customFromPriceCents: 100, marginPct: null, marketingTags: [] },
      providerNetTiers: penNetTiers,
      activePromos: [],
    });
    // El admin fijó el precio EXACTO → un único tramo desde 1 ud a ese precio.
    // La curva sintética (hasta −68% a 250 uds) vendía BAJO COSTE los
    // productos cuyo customFromPriceCents es un PVP (Adivin, auditoría
    // 2026-07-09): a cualquier cantidad, el precio es el que fijó el admin.
    expect(cp.clientTiers).toEqual([
      { minQty: 1, unitPriceCents: 100, source: "PROVIDER" },
    ]);
    expect(cp.fromPriceCents).toBe(100);
  });

  it("marginPct aplica su propio margen en vez del 1,6× global", () => {
    const cp = computeClientPricing({
      product: pen,
      override: { customFromPriceCents: null, marginPct: 50, marketingTags: [] },
      providerNetTiers: penNetTiers,
      activePromos: [],
    });
    // 30 neto × (1 + 50/100) = 45 (no 48).
    expect(cp.fromPriceCents).toBe(45);
    // Y los tramos conservan la curva REAL del proveedor con ese margen,
    // no una curva sintética: cada tramo neto × 1,5.
    expect(cp.clientTiers?.map((t) => t.unitPriceCents)).toEqual(
      penNetTiers.map((t) => Math.round(t.unitPriceCents * 1.5)),
    );
  });
});

describe("adminOverridesPrice — ¿el admin fijó el precio?", () => {
  it("null → false (usa tiers de proveedor)", () => {
    expect(adminOverridesPrice(null)).toBe(false);
  });
  it("override vacío (ambos null) → false", () => {
    expect(
      adminOverridesPrice({ customFromPriceCents: null, marginPct: null, marketingTags: [] }),
    ).toBe(false);
  });
  it("customFromPriceCents fijado → true", () => {
    expect(
      adminOverridesPrice({ customFromPriceCents: 100, marginPct: null, marketingTags: [] }),
    ).toBe(true);
  });
  it("marginPct fijado → true", () => {
    expect(
      adminOverridesPrice({ customFromPriceCents: null, marginPct: 40, marketingTags: [] }),
    ).toBe(true);
  });
  it("caso borde: customFromPriceCents = 0 cuenta como fijado (0 ≠ null)", () => {
    expect(
      adminOverridesPrice({ customFromPriceCents: 0, marginPct: null, marketingTags: [] }),
    ).toBe(true);
  });
});

describe("clientFromPriceCents — neto → precio cliente (pre-promo)", () => {
  it("sin override usa el margen global (no un margen inventado por superficie)", () => {
    expect(clientFromPriceCents(30, null)).toBe(applyMargin(30));
    expect(clientFromPriceCents(1000, null)).toBe(applyMargin(1000));
  });

  it("neto null y sin override → null (no 0, para no cobrar gratis)", () => {
    expect(clientFromPriceCents(null, null)).toBeNull();
  });

  it("customFromPriceCents gana: precio exacto del admin, ignora el neto", () => {
    expect(
      clientFromPriceCents(9999, { customFromPriceCents: 250, marginPct: null, marketingTags: [] }),
    ).toBe(250);
  });

  it("customFromPriceCents vale aunque el neto sea null (precio fijado sin coste de proveedor)", () => {
    expect(
      clientFromPriceCents(null, { customFromPriceCents: 250, marginPct: null, marketingTags: [] }),
    ).toBe(250);
  });

  it("caso borde: customFromPriceCents = 0 → devuelve 0 (gratis explícito del admin, no null)", () => {
    expect(
      clientFromPriceCents(500, { customFromPriceCents: 0, marginPct: null, marketingTags: [] }),
    ).toBe(0);
  });

  it("marginPct aplica su propio margen y redondea", () => {
    expect(
      clientFromPriceCents(1000, { customFromPriceCents: null, marginPct: 50, marketingTags: [] }),
    ).toBe(1500);
    // round(33 × 150 / 100) = round(49,5) = 50
    expect(
      clientFromPriceCents(33, { customFromPriceCents: null, marginPct: 50, marketingTags: [] }),
    ).toBe(50);
  });

  it("caso borde: marginPct = 0 → precio cliente = neto (margen cero, no el 1,6× global)", () => {
    expect(
      clientFromPriceCents(1234, { customFromPriceCents: null, marginPct: 0, marketingTags: [] }),
    ).toBe(1234);
  });
});

describe("displayFromPrice — tarjetas/listados", () => {
  it("aplica margen y PERCENT, marca hasPromo", () => {
    const r = displayFromPrice(pen, null, [promo({ kind: "PERCENT", value: 20 })]);
    expect(r.originalCents).toBe(48); // 30 × 1,6
    expect(r.finalCents).toBe(38); // round(48 × 0,8)
    expect(r.hasPromo).toBe(true);
  });

  it("FIXED no tacha el 'desde' por unidad, pero sí muestra badge", () => {
    const r = displayFromPrice(pen, null, [promo({ kind: "FIXED", value: 500 })]);
    expect(r.originalCents).toBe(48);
    expect(r.finalCents).toBe(48); // sin tachado por unidad
    expect(r.hasPromo).toBe(true); // badge informativo sí
  });

  it("sin promo ni override: solo margen", () => {
    const r = displayFromPrice(pen, null, []);
    expect(r.originalCents).toBe(48);
    expect(r.finalCents).toBe(48);
    expect(r.hasPromo).toBe(false);
  });
});
