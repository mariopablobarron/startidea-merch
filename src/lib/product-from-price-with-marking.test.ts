import { describe, it, expect } from "vitest";
import { elegirReferenciaMarcaje } from "./product-from-price-with-marking";
import type { PriceTier } from "./pricing";

const tier = (minQty: number, unitPriceCents: number): PriceTier => ({
  minQty,
  unitPriceCents,
  source: "PROVIDER",
});

const posicion = (positionId: string, techs: Array<[string, boolean]>) => ({
  positionId,
  techniques: techs.map(([code, isDefault]) => ({ isDefault, technique: { code } })),
});

describe("elegirReferenciaMarcaje — a qué cantidad se compara", () => {
  it("usa la cantidad del tramo que produce el «desde», no la mínima del catálogo", () => {
    // El «desde» de la ficha es el tramo MÁS BARATO, que es el de más
    // unidades. Calcular el marcaje sobre 1 unidad metería el cliché entero
    // en el unitario y daría un número que no compara con nada.
    const ref = elegirReferenciaMarcaje({
      tiers: [tier(1, 28), tier(500, 20), tier(2000, 13)],
      positions: [posicion("Circular", [["S1", false]])],
    });
    expect(ref).toEqual({ quantity: 2000, positionId: "Circular", techniqueCode: "S1" });
  });

  it("con dos tramos al mismo precio se queda con el de MENOS unidades", () => {
    // Prometer un precio a partir de más unidades de las necesarias es el
    // error caro: el cliente pide 500 y el número ya no vale.
    const ref = elegirReferenciaMarcaje({
      tiers: [tier(500, 13), tier(2000, 13)],
      positions: [posicion("Circular", [["S1", false]])],
    });
    expect(ref?.quantity).toBe(500);
  });

  it("prefiere la técnica marcada como predeterminada", () => {
    const ref = elegirReferenciaMarcaje({
      tiers: [tier(250, 40)],
      positions: [posicion("Frontal", [["L2", false], ["S1", true]])],
    });
    expect(ref?.techniqueCode).toBe("S1");
  });

  it("salta las posiciones sin ninguna técnica", () => {
    const ref = elegirReferenciaMarcaje({
      tiers: [tier(250, 40)],
      positions: [posicion("Sin técnicas", []), posicion("Frontal", [["S1", false]])],
    });
    expect(ref?.positionId).toBe("Frontal");
  });

  it("sin tramos o sin posiciones no inventa una referencia", () => {
    expect(elegirReferenciaMarcaje({ tiers: undefined, positions: [posicion("F", [["S1", false]])] })).toBeNull();
    expect(elegirReferenciaMarcaje({ tiers: [], positions: [posicion("F", [["S1", false]])] })).toBeNull();
    expect(elegirReferenciaMarcaje({ tiers: [tier(250, 40)], positions: [] })).toBeNull();
    expect(elegirReferenciaMarcaje({ tiers: [tier(250, 40)], positions: [posicion("F", [])] })).toBeNull();
  });
});
