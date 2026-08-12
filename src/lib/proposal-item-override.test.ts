import { describe, it, expect } from "vitest";
import { validateProposalOverride } from "./proposal-item-override";

describe("validateProposalOverride", () => {
  it("acepta un override sano", () => {
    expect(validateProposalOverride({ description: "Bolígrafo con logo (precio especial)", totalCents: 15000 })).toBeNull();
  });

  it("rechaza concepto vacío o solo espacios", () => {
    expect(validateProposalOverride({ description: "", totalCents: 1000 })).toBeTruthy();
    expect(validateProposalOverride({ description: "   ", totalCents: 1000 })).toBeTruthy();
  });

  it("rechaza concepto demasiado largo", () => {
    expect(validateProposalOverride({ description: "x".repeat(201), totalCents: 1000 })).toBeTruthy();
  });

  it("rechaza total 0, negativo, NaN o infinito — nunca facturar gratis o roto", () => {
    expect(validateProposalOverride({ description: "X", totalCents: 0 })).toBeTruthy();
    expect(validateProposalOverride({ description: "X", totalCents: -500 })).toBeTruthy();
    expect(validateProposalOverride({ description: "X", totalCents: Number.NaN })).toBeTruthy();
    expect(validateProposalOverride({ description: "X", totalCents: Number.POSITIVE_INFINITY })).toBeTruthy();
  });

  it("rechaza céntimos fraccionarios", () => {
    expect(validateProposalOverride({ description: "X", totalCents: 100.5 })).toBeTruthy();
  });

  it("rechaza un total disparatado (tope de cordura 100.000€)", () => {
    expect(validateProposalOverride({ description: "X", totalCents: 10_000_001 })).toBeTruthy();
  });

  it("acepta el tope exacto y 1 céntimo", () => {
    expect(validateProposalOverride({ description: "X", totalCents: 10_000_000 })).toBeNull();
    expect(validateProposalOverride({ description: "X", totalCents: 1 })).toBeNull();
  });
});
