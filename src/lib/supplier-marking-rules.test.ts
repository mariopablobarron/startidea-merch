import { describe, it, expect, vi, beforeEach } from "vitest";

const ruleFindUnique = vi.fn();
const productMarkingPriceFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplierMarkingRule: { findUnique: (...a: unknown[]) => ruleFindUnique(...a) },
    productMarkingPrice: { findUnique: (...a: unknown[]) => productMarkingPriceFindUnique(...a) },
  },
}));

import { quoteMarkingForRule } from "./supplier-marking-rules";

/**
 * Blinda la cascada de quoteMarkingForRule: tarifa ABSOLUTA por tramos tiene
 * prioridad sobre el % aproximado (incidente PROP-2026-0006 2026-08-11 — el
 * % escalaba con el precio del producto, que no tiene nada que ver con el
 * coste real de marcaje del proveedor).
 */
describe("quoteMarkingForRule — tarifa por tramos vs % aproximado", () => {
  beforeEach(() => {
    ruleFindUnique.mockReset();
    productMarkingPriceFindUnique.mockReset();
    productMarkingPriceFindUnique.mockResolvedValue(null); // sin PDF real → cae a SupplierMarkingRule
  });

  it("con tramos cargados: usa precio ABSOLUTO por tramo, ignora markupPct", async () => {
    ruleFindUnique.mockResolvedValue({
      techniqueCode: "A",
      techniqueLabel: "Tampografía",
      markupPct: 30, // debe ignorarse: hay tramos reales
      setupCents: 6000,
      tier1MinQty: 1,
      tier1UnitCents: 7,
      tier2MinQty: 500,
      tier2UnitCents: 6,
      tier3MinQty: 2000,
      tier3UnitCents: 5,
      tier4MinQty: 5000,
      tier4UnitCents: 4,
      active: true,
    });
    const q = await quoteMarkingForRule({
      supplier: "cifra",
      techniqueCode: "A",
      productUnitPriceCents: 9, // precio de producto irrelevante para el tramo
      qty: 500,
    });
    expect(q).not.toBeNull();
    expect(q!.unitMarkupCents).toBe(6); // tramo 500, NO round(9*30/100)=3
    expect(q!.markupPct).toBe(0);
    expect(q!.setupCents).toBe(6000);
    expect(q!.totalMarkingCents).toBe(6000 + 6 * 500);
  });

  it("elige el tramo de mayor minQty que no supere la cantidad pedida", async () => {
    ruleFindUnique.mockResolvedValue({
      techniqueCode: "A",
      techniqueLabel: "Tampografía",
      markupPct: 30,
      setupCents: 6000,
      tier1MinQty: 1,
      tier1UnitCents: 7,
      tier2MinQty: 500,
      tier2UnitCents: 6,
      tier3MinQty: 2000,
      tier3UnitCents: 5,
      tier4MinQty: 5000,
      tier4UnitCents: 4,
      active: true,
    });
    const q300 = await quoteMarkingForRule({
      supplier: "cifra",
      techniqueCode: "A",
      productUnitPriceCents: 9,
      qty: 300,
    });
    expect(q300!.unitMarkupCents).toBe(7); // qty<500 → tramo 1

    const q10000 = await quoteMarkingForRule({
      supplier: "cifra",
      techniqueCode: "A",
      productUnitPriceCents: 9,
      qty: 10000,
    });
    expect(q10000!.unitMarkupCents).toBe(4); // qty>=5000 → tramo 4
  });

  it("tramo parcial (LCO2 solo 3 de 4): tier4 null no rompe, usa el último disponible", async () => {
    ruleFindUnique.mockResolvedValue({
      techniqueCode: "LCO2",
      techniqueLabel: "Láser CO2",
      markupPct: 40,
      setupCents: 3000,
      tier1MinQty: 1,
      tier1UnitCents: 87,
      tier2MinQty: 100,
      tier2UnitCents: 73,
      tier3MinQty: 300,
      tier3UnitCents: 65,
      tier4MinQty: null,
      tier4UnitCents: null,
      active: true,
    });
    const q = await quoteMarkingForRule({
      supplier: "cifra",
      techniqueCode: "LCO2",
      productUnitPriceCents: 500,
      qty: 1000,
    });
    expect(q!.unitMarkupCents).toBe(65); // sin tramo para 1000 → se queda en el último (300)
  });

  it("sin tramos cargados (tier1UnitCents null): cae al % aproximado de siempre", async () => {
    ruleFindUnique.mockResolvedValue({
      techniqueCode: "BORDADO",
      techniqueLabel: "Bordado",
      markupPct: 60,
      setupCents: 6000,
      tier1MinQty: null,
      tier1UnitCents: null,
      tier2MinQty: null,
      tier2UnitCents: null,
      tier3MinQty: null,
      tier3UnitCents: null,
      tier4MinQty: null,
      tier4UnitCents: null,
      active: true,
    });
    const q = await quoteMarkingForRule({
      supplier: "cifra",
      techniqueCode: "BORDADO",
      productUnitPriceCents: 200,
      qty: 100,
    });
    expect(q!.unitMarkupCents).toBe(Math.round((200 * 60) / 100)); // 120
    expect(q!.markupPct).toBe(60);
  });

  it("regla inactiva o inexistente → null", async () => {
    ruleFindUnique.mockResolvedValue(null);
    const q = await quoteMarkingForRule({
      supplier: "cifra",
      techniqueCode: "ZZZ",
      productUnitPriceCents: 100,
      qty: 10,
    });
    expect(q).toBeNull();
  });
});
