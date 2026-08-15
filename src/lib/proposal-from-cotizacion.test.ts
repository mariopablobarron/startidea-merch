import { describe, it, expect, vi, beforeEach } from "vitest";
import { ivaPart, withIva } from "@/lib/iva";

const proposalCreate = vi.fn();
const proposalUpdate = vi.fn();
const generateProposalNumberMock = vi.fn();
const renderToBufferMock = vi.fn();
const sendProposalEmailMock = vi.fn();
const signProposalTokenMock = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    proposal: {
      create: (...a: unknown[]) => proposalCreate(...a),
      update: (...a: unknown[]) => proposalUpdate(...a),
    },
  },
}));
vi.mock("./proposal-number", () => ({
  generateProposalNumber: (...a: unknown[]) => generateProposalNumberMock(...a),
}));
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: (...a: unknown[]) => renderToBufferMock(...a),
}));
vi.mock("./recommender-proposal-pdf", () => ({ RecommenderProposalPdf: () => null }));
vi.mock("./proposal-mailer", () => ({
  sendProposalEmail: (...a: unknown[]) => sendProposalEmailMock(...a),
}));
vi.mock("./proposal-token", () => ({
  signProposalToken: (...a: unknown[]) => signProposalTokenMock(...a),
}));

import { createProposalFromCotizacion } from "./proposal-from-cotizacion";
import type { CotizarOk } from "./cotizar-core";

/**
 * itemOverride (excepción comercial desde /admin/cotizar): blinda que un
 * override inválido NUNCA llega a persistirse ni a facturar, y que uno
 * válido sustituye concepto/precio sin duplicar el marcaje en el PDF
 * (markingPerUnitCents/setupCents deben quedar a 0, breakdown fuera).
 */
function quote(over: { baseTotal: number; qty: number }): CotizarOk {
  const { baseTotal, qty } = over;
  return {
    ok: true,
    product: {
      name: "REGENT",
      brand: null,
      publicRef: "STM-QPUCB3",
      internalRef: "STM-QPUCB3",
      slug: "regent",
      supplier: "midocean",
      supplierRef: "S11380",
      imageUrl: null,
      markingTechniqueHint: null,
      markingSizeHint: null,
      hasRealPricing: true,
    },
    qty,
    portesCents: 0,
    marking: { techniqueCode: "TC", techniqueLabel: "Transfer digital", setupCents: 0, totalMarkingCents: 0 },
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

beforeEach(() => {
  proposalCreate.mockReset();
  proposalUpdate.mockReset();
  generateProposalNumberMock.mockReset().mockResolvedValue("PROP-2026-0099");
  renderToBufferMock.mockReset().mockResolvedValue(Buffer.from("pdf"));
  sendProposalEmailMock.mockReset();
  signProposalTokenMock.mockReset().mockReturnValue("tok");
  proposalCreate.mockResolvedValue({ id: "prop_1" });
});

describe("createProposalFromCotizacion — itemOverride", () => {
  it("override inválido (total 0€) → ok:false, NO persiste nada", async () => {
    const r = await createProposalFromCotizacion({
      quote: quote({ baseTotal: 23324, qty: 30 }),
      email: "cliente@empresa.com",
      itemOverride: { description: "Regalo cortesía", totalCents: 0 },
    });
    expect(r.ok).toBe(false);
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("override inválido (concepto vacío) → ok:false, NO persiste nada", async () => {
    const r = await createProposalFromCotizacion({
      quote: quote({ baseTotal: 23324, qty: 30 }),
      email: "cliente@empresa.com",
      itemOverride: { description: "   ", totalCents: 5000 },
    });
    expect(r.ok).toBe(false);
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it("override válido: sustituye descripción/total, zera marcaje y quita breakdown (evita duplicar en el PDF)", async () => {
    const r = await createProposalFromCotizacion({
      quote: quote({ baseTotal: 23324, qty: 30 }),
      email: "cliente@empresa.com",
      itemOverride: { description: "Bolígrafo — precio acordado por volumen", totalCents: 18000 },
    });
    expect(r.ok).toBe(true);
    expect(proposalCreate).toHaveBeenCalledTimes(1);
    const data = proposalCreate.mock.calls[0][0].data;
    const items = data.quoteItems;
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Bolígrafo — precio acordado por volumen");
    expect(items[0].totalCents).toBe(18000);
    expect(items[0].unitPriceCents).toBe(Math.round(18000 / 30));
    expect(items[0].manualOverride).toBe(true);
    expect(items[0].markingPerUnitCents).toBe(0);
    expect(items[0].markingSetupCents).toBe(0);
    expect(items[0].breakdown).toBeUndefined();
    // Los totales de la propuesta reflejan el override, no el cálculo original.
    expect(data.subtotalCents).toBe(18000);
    expect(data.totalCents).toBe(withIva(18000));
  });

  it("sin itemOverride: comportamiento de siempre, NO marca manualOverride", async () => {
    const r = await createProposalFromCotizacion({
      quote: quote({ baseTotal: 23324, qty: 30 }),
      email: "cliente@empresa.com",
    });
    expect(r.ok).toBe(true);
    const items = proposalCreate.mock.calls[0][0].data.quoteItems;
    expect(items[0].manualOverride).toBeUndefined();
    expect(items[0].totalCents).toBe(23324);
  });

  it("persiste SKU/color/tallas de la solicitud pública para revisión", async () => {
    const variantSelection = {
      summary: "10× CAM-S · 20× CAM-M",
      variantLines: [
        { sku: "CAM-S", colorName: "AZUL", size: "S", quantity: 10 },
        { sku: "CAM-M", colorName: "AZUL", size: "M", quantity: 20 },
      ],
    };

    const result = await createProposalFromCotizacion({
      quote: quote({ baseTotal: 23324, qty: 30 }),
      email: "cliente@empresa.com",
      variantSelection,
      status: "draft",
      send: false,
    });

    expect(result.ok).toBe(true);
    const items = proposalCreate.mock.calls[0][0].data.quoteItems;
    expect(items[0].variantSelection).toEqual(variantSelection);
  });
});
