import { describe, expect, it } from "vitest";

import { FALLBACK_LABEL, formatCatalogFloor } from "./catalog-count";

describe("formatCatalogFloor", () => {
  it("redondea a la baja al millar y formatea en español", () => {
    // El caso real medido el 26-ago-2026: 9.618 productos activos.
    expect(formatCatalogFloor(9618)).toBe("9.000");
  });

  it("NUNCA redondea al alza: la frase que lo envuelve es «más de X»", () => {
    // 9.999 al alza daría «más de 10.000», que es falso. Este es el test que
    // separa este helper de un `Math.round`, que aquí mentiría.
    expect(formatCatalogFloor(9999)).toBe("9.000");
    expect(formatCatalogFloor(2001)).toBe("2.000");
  });

  it("con el catálogo justo en un millar devuelve ese millar", () => {
    expect(formatCatalogFloor(9000)).toBe("9.000");
  });

  it("por debajo de mil da el recuento exacto, no «más de 0»", () => {
    // Redondear 840 a la baja al millar daría 0 y la home diría «más de 0
    // referencias», que es peor que no decir nada.
    expect(formatCatalogFloor(840)).toBe("840");
    expect(formatCatalogFloor(1)).toBe("1");
  });

  it("sin recuento no inventa una cifra: devuelve la etiqueta vaga", () => {
    // El fallback anterior era «2.400» escrito a mano, y ya mentía por defecto.
    expect(formatCatalogFloor(undefined)).toBe(FALLBACK_LABEL);
    expect(formatCatalogFloor(null)).toBe(FALLBACK_LABEL);
    expect(formatCatalogFloor(0)).toBe(FALLBACK_LABEL);
    expect(formatCatalogFloor(-5)).toBe(FALLBACK_LABEL);
    expect(formatCatalogFloor(Number.NaN)).toBe(FALLBACK_LABEL);
  });

  it("la etiqueta de fallback no contiene ningún número", () => {
    // Si alguien la cambia por «2.400» volvemos al defecto que se quiso quitar.
    expect(FALLBACK_LABEL).not.toMatch(/\d/);
  });
});
