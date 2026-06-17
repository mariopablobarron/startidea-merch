import { describe, it, expect } from "vitest";
import type { Promotion } from "@prisma/client";
import {
  applyPromotionToPrice,
  applyBestUnitPromotion,
  applyBestPromotionToTiers,
  pickOrderFixedPromotion,
  pickDisplayPromotion,
  defaultBadgeText,
  type ProductForPromo,
} from "./promotions-core";

// Promotion de prueba: rellena los campos no relevantes para el engine.
function promo(overrides: Partial<Promotion>): Promotion {
  return {
    id: "promo-1",
    name: "Promo de prueba",
    slug: "promo-prueba",
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

const product: ProductForPromo = { id: "prod-1", categoryId: "cat-1", brand: "BrandX" };

describe("applyPromotionToPrice — math sobre un importe", () => {
  it("PERCENT descuenta el porcentaje", () => {
    const r = applyPromotionToPrice(promo({ kind: "PERCENT", value: 20 }), 1000);
    expect(r.finalCents).toBe(800);
    expect(r.discountCents).toBe(200);
    expect(r.discountPct).toBe(20);
  });

  it("FIXED resta el valor UNA vez (correcto sobre un subtotal de pedido)", () => {
    const r = applyPromotionToPrice(promo({ kind: "FIXED", value: 500 }), 12000);
    expect(r.finalCents).toBe(11500);
    expect(r.discountCents).toBe(500);
  });

  it("FIXED nunca baja de 0", () => {
    const r = applyPromotionToPrice(promo({ kind: "FIXED", value: 500 }), 300);
    expect(r.finalCents).toBe(0);
    expect(r.discountCents).toBe(300);
  });
});

describe("applyBestUnitPromotion — precio UNITARIO (solo PERCENT)", () => {
  it("aplica PERCENT por unidad", () => {
    const r = applyBestUnitPromotion(product, 100, [promo({ kind: "PERCENT", value: 25 })]);
    expect(r.finalCents).toBe(75);
    expect(r.promo).not.toBeNull();
  });

  it("IGNORA FIXED por unidad (FIXED es descuento de pedido, no por ud)", () => {
    const r = applyBestUnitPromotion(product, 100, [promo({ kind: "FIXED", value: 500 })]);
    expect(r.finalCents).toBe(100); // sin cambio
    expect(r.promo).toBeNull();
  });

  it("entre dos PERCENT gana el mayor", () => {
    const r = applyBestUnitPromotion(product, 100, [
      promo({ id: "a", kind: "PERCENT", value: 10 }),
      promo({ id: "b", kind: "PERCENT", value: 30 }),
    ]);
    expect(r.finalCents).toBe(70);
  });
});

describe("applyBestPromotionToTiers — FIXED no corrompe los tiers", () => {
  const tiers = [
    { minQty: 10, unitPriceCents: 80 },
    { minQty: 100, unitPriceCents: 48 },
  ];

  it("FIXED deja los precios unitarios INTACTOS (antes los ponía a 0 en merch barato)", () => {
    const out = applyBestPromotionToTiers(product, tiers, [
      promo({ kind: "FIXED", value: 500 }),
    ]);
    expect(out.map((t) => t.unitPriceCents)).toEqual([80, 48]);
    expect(out.every((t) => t.promo === null)).toBe(true);
    expect(out.every((t) => t.discountPct === 0)).toBe(true);
  });

  it("PERCENT sí se hornea por unidad en cada tier", () => {
    const out = applyBestPromotionToTiers(product, tiers, [
      promo({ kind: "PERCENT", value: 25 }),
    ]);
    expect(out.map((t) => t.unitPriceCents)).toEqual([60, 36]);
    expect(out.every((t) => t.discountPct === 25)).toBe(true);
  });
});

describe("selección no acumulable PERCENT vs FIXED", () => {
  it("pickOrderFixedPromotion devuelve el FIXED solo si NO hay PERCENT", () => {
    const fixedOnly = pickOrderFixedPromotion(product, [promo({ kind: "FIXED", value: 500 })]);
    expect(fixedOnly?.value).toBe(500);

    const both = pickOrderFixedPromotion(product, [
      promo({ id: "f", kind: "FIXED", value: 500 }),
      promo({ id: "p", kind: "PERCENT", value: 20 }),
    ]);
    expect(both).toBeNull(); // PERCENT gana → no se apila el FIXED
  });

  it("pickDisplayPromotion prioriza PERCENT para el badge", () => {
    const p = pickDisplayPromotion(product, [
      promo({ id: "f", kind: "FIXED", value: 500 }),
      promo({ id: "p", kind: "PERCENT", value: 20 }),
    ]);
    expect(p?.kind).toBe("PERCENT");
  });

  it("matching por scope: una promo de otra categoría NO aplica", () => {
    const r = applyBestUnitPromotion(product, 100, [
      promo({ kind: "PERCENT", value: 50, scope: "CATEGORY", targetIds: ["otra-cat"] }),
    ]);
    expect(r.finalCents).toBe(100);
  });
});

describe("defaultBadgeText — FIXED muestra céntimos reales", () => {
  it("550 c → −5,50€ (no redondea a −6€)", () => {
    expect(defaultBadgeText("FIXED", 550)).toBe("−5,50€");
  });
  it("500 c → −5€ (sin decimales si es entero)", () => {
    expect(defaultBadgeText("FIXED", 500)).toBe("−5€");
  });
  it("PERCENT 20 → −20%", () => {
    expect(defaultBadgeText("PERCENT", 20)).toBe("−20%");
  });
});
