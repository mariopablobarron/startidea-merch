import { describe, it, expect } from "vitest";
import { toNum, priceToCents } from "./makito-sync";

/**
 * Makito trae 69.024 tramos de precio y ninguno tenía test. La divergencia con
 * MidOcean era real: allí el punto se trata como separador de millares, aquí no
 * se tocaba, así que "1.234,56" acababa en 123 céntimos en vez de 123.456.
 *
 * Hoy no muerde —el tramo más caro del catálogo son 84 €, ni un precio llega a
 * los mil— pero es exactamente el mismo patrón latente que ya costó dos
 * incidentes: código correcto sólo porque los datos de hoy son benignos.
 */

describe("toNum — números del XML de Makito", () => {
  it("lee la coma como decimal", () => {
    expect(toNum("12,34")).toBe(12.34);
    expect(toNum("0,52")).toBe(0.52);
  });

  it("con los DOS separadores, el punto son millares", () => {
    // El caso que estaba roto: parseFloat("1.234.56") devolvía 1.234.
    expect(toNum("1.234,56")).toBe(1234.56);
    expect(toNum("1.000,00")).toBe(1000);
    expect(toNum("12.345,67")).toBe(12345.67);
  });

  it("con un solo punto NO presume millares — el feed es ambiguo ahí", () => {
    // Por esta función pasan también medidas y pesos: "1.5" es uno y medio.
    // Convertirlo en 15 rompería cmToMm y el peso de los productos.
    expect(toNum("1.5")).toBe(1.5);
    expect(toNum("12.5")).toBe(12.5);
  });

  it("acepta números ya tipados sin tocarlos", () => {
    expect(toNum(7)).toBe(7);
    expect(toNum(0)).toBe(0);
    expect(toNum(12.34)).toBe(12.34);
  });

  it("distingue ausencia (null) de cero", () => {
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum("")).toBeNull();
    expect(toNum("0")).toBe(0);
  });

  it("devuelve null ante basura, nunca NaN", () => {
    for (const v of ["n/a", "-", "abc"]) {
      const out = toNum(v);
      expect(out === null || Number.isFinite(out)).toBe(true);
      expect(Number.isNaN(out as number)).toBe(false);
    }
  });
});

describe("priceToCents — el coste que acaba en el PVP", () => {
  it("convierte a céntimos enteros", () => {
    expect(priceToCents("12,34")).toBe(1234);
    expect(priceToCents(1.5)).toBe(150);
    expect(Number.isInteger(priceToCents("0,555"))).toBe(true);
  });

  it("un precio de cuatro cifras no se divide por mil", () => {
    // Invariante de dinero: 1.234,56 € son 123.456 céntimos, no 123.
    expect(priceToCents("1.234,56")).toBe(123456);
  });

  it("ausencia o basura → 0, nunca NaN", () => {
    for (const v of [null, undefined, "", "n/a"]) {
      const out = priceToCents(v);
      expect(Number.isFinite(out)).toBe(true);
      expect(out).toBe(0);
    }
  });

  it("coincide con el parseo de MidOcean para el mismo texto", () => {
    // La divergencia entre proveedores era el problema de fondo: el mismo
    // string debe dar el mismo coste venga del feed que venga.
    expect(priceToCents("1.234,56")).toBe(123456);
    expect(priceToCents("0,52")).toBe(52);
    expect(priceToCents("1.000,50")).toBe(100050);
  });
});
