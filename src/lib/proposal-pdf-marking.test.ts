import { describe, it, expect } from "vitest";
import { markingCellText, type ItemWithMarkings } from "./marking-cell-text";

// Molde mínimo de un CartQuoteItem: solo lo que lee markingCellText.
function item(overrides: Record<string, unknown>): ItemWithMarkings {
  return {
    markingTechniqueName: null,
    markingPositionId: null,
    markingColours: null,
    markings: undefined,
    ...overrides,
  } as unknown as ItemWithMarkings;
}

function marking(overrides: Record<string, unknown>) {
  return {
    positionId: "Area 1",
    positionLabel: null,
    techniqueName: null,
    numberOfColors: 1,
    order: 0,
    ...overrides,
  };
}

describe("markingCellText — el resumen lista TODAS las posiciones", () => {
  it("lista las dos posiciones (Área 1 + Área 7), no solo la primera", () => {
    // El caso real de AUNA: pagó 2 serigrafías pero el PDF solo mostraba Area 1.
    const text = markingCellText(
      item({
        markingTechniqueName: "Serigrafía F",
        markingPositionId: "Area 1",
        markings: [
          marking({ positionLabel: "Área 1", techniqueName: "Serigrafía F", order: 0 }),
          marking({ positionId: "Area 7", positionLabel: "Área 7", techniqueName: "Serigrafía F", order: 1 }),
        ],
      }),
    );
    expect(text).toBe("Serigrafía F · Área 1\nSerigrafía F · Área 7");
    // Lo que fallaba antes: que el Área 7 apareciera.
    expect(text).toContain("Área 7");
  });

  it("respeta el orden de las posiciones aunque lleguen desordenadas", () => {
    const text = markingCellText(
      item({
        markings: [
          marking({ positionId: "B", positionLabel: "Espalda", techniqueName: "Serigrafía F", order: 2 }),
          marking({ positionId: "F", positionLabel: "Pecho", techniqueName: "Serigrafía F", order: 1 }),
        ],
      }),
    );
    expect(text).toBe("Serigrafía F · Pecho\nSerigrafía F · Espalda");
  });

  it("añade el nº de colores solo cuando es >1", () => {
    const text = markingCellText(
      item({
        markings: [marking({ positionLabel: "Área 1", techniqueName: "Bordado", numberOfColors: 3 })],
      }),
    );
    expect(text).toBe("Bordado · Área 1 · 3 col.");
  });

  it("cae a los campos planos si la línea no tiene markings[] (datos antiguos)", () => {
    const text = markingCellText(
      item({ markingTechniqueName: "Láser", markingPositionId: "Frontal", markings: [] }),
    );
    expect(text).toBe("Láser · Frontal");
  });

  it("devuelve — si no hay marca ninguna", () => {
    expect(markingCellText(item({}))).toBe("—");
  });
});
