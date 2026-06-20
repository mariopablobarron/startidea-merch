import { describe, it, expect } from "vitest";
import { IVA_RATE, withIva, ivaPart } from "./iva";

/**
 * Tests de la fuente única de IVA (decisión Mario 2026-06-17: precios BASE sin
 * IVA, +21% al cobrar). Protege la lógica financiera que detectó la caza de
 * bugs (el cobro recaudaba un 21% de menos). Funciones puras, sin mocks.
 */
describe("iva", () => {
  it("el tipo es 21%", () => {
    expect(IVA_RATE).toBe(0.21);
  });

  it("withIva añade el 21% (ejemplo de negocio 1.000 € → 1.210 €)", () => {
    expect(withIva(100000)).toBe(121000); // 1.000,00 € base → 1.210,00 € con IVA
    expect(withIva(0)).toBe(0);
    expect(withIva(50000)).toBe(60500); // 500 € → 605 €
    expect(withIva(100000000)).toBe(121000000); // 1.000.000 € → 1.210.000 €
  });

  it("ivaPart devuelve solo el IVA", () => {
    expect(ivaPart(100000)).toBe(21000); // 210 € de IVA sobre 1.000 €
    expect(ivaPart(0)).toBe(0);
    expect(ivaPart(50000)).toBe(10500);
  });

  it("redondea a céntimos enteros (nada de fracciones de céntimo)", () => {
    expect(Number.isInteger(withIva(99))).toBe(true);
    expect(Number.isInteger(ivaPart(99))).toBe(true);
    expect(withIva(99)).toBe(120); // round(99 * 1.21) = round(119.79) = 120
    expect(ivaPart(99)).toBe(21); // round(99 * 0.21) = round(20.79) = 21
    expect(withIva(1)).toBe(1); // round(1.21) = 1
    expect(ivaPart(1)).toBe(0); // round(0.21) = 0
  });

  it("invariante: withIva(base) === base + ivaPart(base) para todo importe", () => {
    for (const base of [0, 1, 7, 99, 100, 333, 12345, 100000, 999999, 100000000]) {
      expect(withIva(base)).toBe(base + ivaPart(base));
    }
  });
});
