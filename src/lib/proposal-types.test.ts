import { describe, it, expect } from "vitest";
import { computeProposalTotals, cotizacionToProposalItem, type ProposalQuoteItem } from "./proposal-types";
import { ivaPart, withIva } from "./iva";
import type { CotizarOk } from "./cotizar-core";

/**
 * Blinda la matemática de dinero del puente cotización → propuesta:
 *  - computeProposalTotals: subtotal (ignora notFound) + 21% IVA con redondeo.
 *  - cotizacionToProposalItem: línea todo-incluido + NUNCA expone el proveedor.
 * Funciones puras (sin BD/red), acorde a la convención de vitest del repo.
 */

function item(partial: Partial<ProposalQuoteItem> = {}): ProposalQuoteItem {
  return {
    description: "X",
    notFound: false,
    quantity: 1,
    sizes: null,
    technique: null,
    colorRequested: null,
    product: { slug: "x", name: "X", ref: "STM-X", url: "u", primaryImageUrl: null },
    unitPriceCents: 1000,
    markingPerUnitCents: 0,
    markingSetupCents: 0,
    totalCents: 1000,
    priceSource: "tier",
    ...partial,
  };
}

describe("computeProposalTotals", () => {
  it("suma totalCents y añade 21% IVA", () => {
    const t = computeProposalTotals([item({ totalCents: 10000 }), item({ totalCents: 5000 })]);
    expect(t.subtotalCents).toBe(15000);
    expect(t.ivaCents).toBe(3150);
    expect(t.totalCents).toBe(18150);
  });

  it("ignora los items notFound", () => {
    const t = computeProposalTotals([item({ totalCents: 10000 }), item({ notFound: true, totalCents: null })]);
    expect(t.subtotalCents).toBe(10000);
  });

  it("lista vacía → 0/0/0", () => {
    expect(computeProposalTotals([])).toEqual({ subtotalCents: 0, ivaCents: 0, totalCents: 0 });
  });

  it("todos notFound → 0", () => {
    const t = computeProposalTotals([
      item({ notFound: true, totalCents: null }),
      item({ notFound: true, totalCents: null }),
    ]);
    expect(t.subtotalCents).toBe(0);
    expect(t.totalCents).toBe(0);
  });

  it("redondea el IVA a céntimo (subtotal impar)", () => {
    // 9750 * 0.21 = 2047.5 → 2048
    const t = computeProposalTotals([item({ totalCents: 9750 })]);
    expect(t.ivaCents).toBe(2048);
    expect(t.totalCents).toBe(11798);
  });

  it("el IVA coincide con la fuente única iva.ts", () => {
    const sub = 23324;
    const t = computeProposalTotals([item({ totalCents: sub })]);
    expect(t.ivaCents).toBe(ivaPart(sub));
    expect(t.totalCents).toBe(withIva(sub));
  });
});

function quote(over: {
  baseTotal: number;
  qty: number;
  hasRealPricing?: boolean;
  supplierRef?: string;
  publicRef?: string;
  markingLabel?: string;
}): CotizarOk {
  const { baseTotal, qty } = over;
  return {
    ok: true,
    product: {
      name: "REGENT",
      brand: null,
      publicRef: over.publicRef ?? "STM-QPUCB3",
      internalRef: over.publicRef ?? "STM-QPUCB3",
      slug: "regent",
      supplier: "midocean",
      supplierRef: over.supplierRef ?? "S11380",
      imageUrl: null,
      markingTechniqueHint: null,
      markingSizeHint: null,
      hasRealPricing: over.hasRealPricing ?? true,
    },
    qty,
    portesCents: 0,
    ...(over.markingLabel
      ? { marking: { techniqueCode: "TC", techniqueLabel: over.markingLabel, setupCents: 0, totalMarkingCents: 0 } }
      : {}),
    coste: { productoTotal: 0, marcajeTotal: 0, portesTotal: 0, total: 0 },
    margenEfectivoPct: 60,
    cupon: null,
    cuponError: null,
    envioGratis: false,
    pvp: {
      productoTotal: baseTotal,
      marcajeTotal: 0,
      envioTotal: 0,
      descuentoCents: 0,
      baseTotal,
      unit: Math.round(baseTotal / qty),
      ivaCents: ivaPart(baseTotal),
      totalConIva: withIva(baseTotal),
    },
  };
}

describe("cotizacionToProposalItem", () => {
  it("línea todo-incluido: totalCents = baseTotal y unit = round(baseTotal/qty)", () => {
    const line = cotizacionToProposalItem(quote({ baseTotal: 23324, qty: 30 }));
    expect(line.totalCents).toBe(23324);
    expect(line.unitPriceCents).toBe(Math.round(23324 / 30));
    expect(line.markingPerUnitCents).toBe(0);
    expect(line.markingSetupCents).toBe(0);
    expect(line.notFound).toBe(false);
    expect(line.quantity).toBe(30);
  });

  it("NUNCA expone el proveedor: ref = publicRef, no supplierRef", () => {
    const line = cotizacionToProposalItem(
      quote({ baseTotal: 10000, qty: 10, publicRef: "STM-QPUCB3", supplierRef: "S11380" }),
    );
    expect(line.product?.ref).toBe("STM-QPUCB3");
    expect(line.product?.ref).not.toBe("S11380");
  });

  it("priceSource refleja si hay tarifa real", () => {
    expect(cotizacionToProposalItem(quote({ baseTotal: 100, qty: 1, hasRealPricing: true })).priceSource).toBe("tier");
    expect(cotizacionToProposalItem(quote({ baseTotal: 100, qty: 1, hasRealPricing: false })).priceSource).toBe(
      "estimate",
    );
  });

  it("technique = etiqueta de marcaje, o null si no hay", () => {
    expect(
      cotizacionToProposalItem(quote({ baseTotal: 100, qty: 1, markingLabel: "Transfer digital" })).technique,
    ).toBe("Transfer digital");
    expect(cotizacionToProposalItem(quote({ baseTotal: 100, qty: 1 })).technique).toBeNull();
  });

  it("el total reconstruido por computeProposalTotals cuadra con la cotización", () => {
    const q = quote({ baseTotal: 23324, qty: 30 });
    const totals = computeProposalTotals([cotizacionToProposalItem(q)]);
    expect(totals.subtotalCents).toBe(q.pvp.baseTotal);
    expect(totals.totalCents).toBe(q.pvp.totalConIva);
  });
});
