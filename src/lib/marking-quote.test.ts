import { describe, it, expect, vi, beforeEach } from "vitest";

const markingTechniqueFindUnique = vi.fn();
const calculateMarkingCostMock = vi.fn();
const quoteMarkingForRuleMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    markingTechnique: {
      findUnique: (...a: unknown[]) => markingTechniqueFindUnique(...a),
    },
  },
}));

vi.mock("@/lib/marking-cost", () => ({
  calculateMarkingCost: (...a: unknown[]) => calculateMarkingCostMock(...a),
}));

vi.mock("@/lib/supplier-marking-rules", () => ({
  quoteMarkingForRule: (...a: unknown[]) => quoteMarkingForRuleMock(...a),
}));

import { quoteMarkingNet } from "./marking-quote";

/**
 * Tests de src/lib/marking-quote.ts — `quoteMarkingNet` es la cascada
 * UNIFICADA que decide de dónde sale el coste de marcaje (DINERO, hallazgo
 * P1.10 de la auditoría). Mockeamos los dos motores que orquesta
 * (`calculateMarkingCost` para MidOcean/Makito, `quoteMarkingForRule` para
 * Cifra CIF_*) para aislar exclusivamente la lógica de la cascada: qué rama
 * se toma, cómo se mapea el resultado y que NUNCA hay `ok:true` con coste 0€.
 */

const baseOpts = {
  productId: "prod-1",
  supplier: "midocean" as const,
  techniqueCode: "B",
  quantity: 100,
  productNetUnitCents: 50,
};

beforeEach(() => {
  markingTechniqueFindUnique.mockReset();
  calculateMarkingCostMock.mockReset();
  quoteMarkingForRuleMock.mockReset();
});

describe("quoteMarkingNet — rama MidOcean/Makito (scales)", () => {
  it("sin warning del motor de escalas → ok:true, mapea coste/setup/label, source 'scales'", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "Serigrafía",
      totalCostCents: 4200,
      setupCents: 1000,
    });
    const r = await quoteMarkingNet(baseOpts);
    expect(r).toEqual({
      ok: true,
      netTotalCents: 4200,
      techniqueLabel: "Serigrafía",
      setupCents: 1000,
      source: "scales",
    });
  });

  it("REGRESIÓN marcaje a 0€: warning del motor de escalas → ok:false, NUNCA ok:true con netTotalCents 0", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "Serigrafía",
      totalCostCents: 0,
      setupCents: 0,
      warning: "No hay tramo de cantidad aplicable. Pedir cotización manual.",
    });
    const r = await quoteMarkingNet(baseOpts);
    expect(r.ok).toBe(false);
    expect(r.netTotalCents).toBe(0);
    expect(r.source).toBe("none");
    expect(r.warning).toMatch(/pedir cotización manual/i);
    // Invariante central: si ok es false, jamás se cobra en checkout.
    if (r.netTotalCents === 0) expect(r.ok).toBe(false);
  });

  it("recorta espacios del techniqueCode antes de decidir la rama y de llamar al motor", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "Bordado",
      totalCostCents: 100,
      setupCents: 0,
    });
    await quoteMarkingNet({ ...baseOpts, techniqueCode: "  B  " });
    expect(calculateMarkingCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ techniqueCode: "B" }),
    );
  });

  it("proveedor midocean: pasa manipulationCode tal cual (undefined si no se da)", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "Tampografía",
      totalCostCents: 100,
      setupCents: 0,
    });
    await quoteMarkingNet({ ...baseOpts, supplier: "midocean", manipulationCode: "C" });
    expect(calculateMarkingCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ manipulationCode: "C" }),
    );
  });

  it("proveedor midocean SIN manipulationCode → pasa undefined (no null)", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "Tampografía",
      totalCostCents: 100,
      setupCents: 0,
    });
    await quoteMarkingNet({ ...baseOpts, supplier: "midocean", manipulationCode: null });
    expect(calculateMarkingCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ manipulationCode: undefined }),
    );
  });

  it("proveedor NO-MidOcean (ej. makito): SIEMPRE pasa manipulationCode null, aunque opts traiga uno — no rompe el cálculo", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "MK_F",
      totalCostCents: 100,
      setupCents: 0,
    });
    await quoteMarkingNet({
      ...baseOpts,
      supplier: "makito" as unknown as typeof baseOpts.supplier,
      manipulationCode: "C", // aunque el caller lo pase, no es un concepto Makito
    });
    expect(calculateMarkingCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ manipulationCode: null }),
    );
  });

  it("pasa positionCount, printAreaCm2 y numberOfColours al motor de escalas", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "DTF",
      totalCostCents: 100,
      setupCents: 0,
    });
    await quoteMarkingNet({
      ...baseOpts,
      positionCount: 3,
      printAreaCm2: 120,
      numberOfColours: 4,
    });
    expect(calculateMarkingCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ positionCount: 3, printAreaCm2: 120, numberOfColours: 4 }),
    );
  });

  it("printAreaCm2/numberOfColours null se traducen a undefined (no null) hacia el motor", async () => {
    calculateMarkingCostMock.mockResolvedValueOnce({
      techniqueName: "DTF",
      totalCostCents: 100,
      setupCents: 0,
    });
    await quoteMarkingNet({ ...baseOpts, printAreaCm2: null, numberOfColours: null });
    expect(calculateMarkingCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ printAreaCm2: undefined, numberOfColours: undefined }),
    );
  });
});

describe("quoteMarkingNet — rama Cifra (CIF_*)", () => {
  it("detecta el prefijo CIF_ sin importar mayúsculas/minúsculas", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce({
      techniqueLabel: "Serigrafía Cifra",
      totalMarkingCents: 500,
      setupCents: 200,
      markupPct: 0,
    });
    await quoteMarkingNet({ ...baseOpts, techniqueCode: "cif_abc" });
    expect(quoteMarkingForRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({ techniqueCode: "ABC" }),
    );
    // Y NO debe tocar el motor de escalas de MidOcean/Makito.
    expect(calculateMarkingCostMock).not.toHaveBeenCalled();
  });

  it("quita el prefijo CIF_ (4 chars) antes de consultar la regla del proveedor", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce({
      techniqueLabel: "Bordado Cifra",
      totalMarkingCents: 500,
      setupCents: 0,
      markupPct: 0,
    });
    await quoteMarkingNet({ ...baseOpts, techniqueCode: "CIF_BORDADO" });
    expect(quoteMarkingForRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({ techniqueCode: "BORDADO" }),
    );
  });

  it("tarifa REAL (markupPct 0) → ok:true, source 'product-tariff'", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce({
      techniqueLabel: "Serigrafía Cifra",
      totalMarkingCents: 500,
      setupCents: 200,
      markupPct: 0,
    });
    const r = await quoteMarkingNet({ ...baseOpts, techniqueCode: "CIF_SER" });
    expect(r).toEqual({
      ok: true,
      netTotalCents: 500,
      techniqueLabel: "Serigrafía Cifra",
      setupCents: 200,
      source: "product-tariff",
    });
  });

  it("fallback por markup % (markupPct > 0) → ok:true, source 'rule'", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce({
      techniqueLabel: "Serigrafía Cifra",
      totalMarkingCents: 800,
      setupCents: 0,
      markupPct: 15,
    });
    const r = await quoteMarkingNet({ ...baseOpts, techniqueCode: "CIF_SER" });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("rule");
  });

  it("REGRESIÓN marcaje a 0€: sin tarifa real NI regla (null) → ok:false, jamás cobra 0€ en silencio", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce(null);
    markingTechniqueFindUnique.mockResolvedValueOnce({ name: "Serigrafía Cifra" });
    const r = await quoteMarkingNet({ ...baseOpts, techniqueCode: "CIF_SER" });
    expect(r.ok).toBe(false);
    expect(r.netTotalCents).toBe(0);
    expect(r.source).toBe("none");
    expect(r.warning).toMatch(/sin tarifa real registrada/i);
    expect(r.techniqueLabel).toBe("Serigrafía Cifra");
  });

  it("sin tarifa/regla y SIN técnica en BD → usa el código original (con prefijo CIF_) como label", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce(null);
    markingTechniqueFindUnique.mockResolvedValueOnce(null);
    const r = await quoteMarkingNet({ ...baseOpts, techniqueCode: "CIF_SER" });
    expect(r.ok).toBe(false);
    expect(r.techniqueLabel).toBe("CIF_SER");
  });

  it("la búsqueda de fallback de nombre consulta por el código COMPLETO (con prefijo), no el recortado", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce(null);
    markingTechniqueFindUnique.mockResolvedValueOnce(null);
    await quoteMarkingNet({ ...baseOpts, techniqueCode: "CIF_SER" });
    expect(markingTechniqueFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: "CIF_SER" } }),
    );
  });

  it("pasa productId, qty y precio unitario del producto a quoteMarkingForRule", async () => {
    quoteMarkingForRuleMock.mockResolvedValueOnce({
      techniqueLabel: "X",
      totalMarkingCents: 100,
      setupCents: 0,
      markupPct: 0,
    });
    await quoteMarkingNet({ ...baseOpts, techniqueCode: "CIF_X", quantity: 250, productNetUnitCents: 77 });
    expect(quoteMarkingForRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "prod-1",
        qty: 250,
        productUnitPriceCents: 77,
        supplier: "midocean",
      }),
    );
  });
});
