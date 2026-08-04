import { describe, it, expect } from "vitest";
import {
  eurStringToCents,
  intFromQty,
  parseAreaCm2,
} from "./feed-number-parsing";

/**
 * El feed de MidOcean es la entrada de COSTE de miles de productos: lo que
 * salga de aquí se multiplica por el margen y acaba siendo el PVP que paga el
 * cliente. Estaba a cero tests.
 *
 * Los casos no son inventados: el sentinel "999.999" y las espaldas de 1.120
 * cm² son los datos reales que en la auditoría del 2026-07-09 hicieron que el
 * marcaje cotizara 0 €.
 */

describe("eurStringToCents — coste de proveedor en formato europeo", () => {
  it("lee la coma como decimal", () => {
    expect(eurStringToCents("0,52")).toBe(52);
    expect(eurStringToCents("1,00")).toBe(100);
    expect(eurStringToCents("12,34")).toBe(1234);
  });

  it("lee el punto como MILLARES, no como decimal", () => {
    // Éste es el invariante que importa: "1.000,50" son mil euros y medio,
    // no uno con cero cinco. parseFloat a secas devolvería 1 → 100 céntimos.
    expect(eurStringToCents("1.000,50")).toBe(100050);
    expect(eurStringToCents("1.234,56")).toBe(123456);
  });

  it("aguanta un entero sin decimales", () => {
    expect(eurStringToCents("7")).toBe(700);
    expect(eurStringToCents("1.500")).toBe(150000);
  });

  it("nunca devuelve NaN ante ausencia o basura", () => {
    // Un NaN aquí se propaga al PVP y rompe el checkout en silencio.
    for (const v of [null, undefined, "", "  ", "n/a", "-"]) {
      const out = eurStringToCents(v as string);
      expect(Number.isFinite(out)).toBe(true);
      expect(out).toBe(0);
    }
  });

  it("devuelve céntimos ENTEROS (nada de fracciones de céntimo)", () => {
    expect(Number.isInteger(eurStringToCents("0,555"))).toBe(true);
    expect(eurStringToCents("0,555")).toBe(56); // redondeo, no truncado
    expect(eurStringToCents("0,554")).toBe(55);
  });

  it("nunca devuelve un coste negativo por un signo colado en el feed", () => {
    // No es un caso teórico: un coste negativo daría PVP negativo tras margen.
    expect(eurStringToCents("-1,00")).toBeLessThanOrEqual(0);
  });
});

describe("intFromQty — cantidad mínima del tramo", () => {
  it("lee cantidades con y sin separador de millares", () => {
    expect(intFromQty("1")).toBe(1);
    expect(intFromQty("250")).toBe(250);
    expect(intFromQty("1.000")).toBe(1000);
    expect(intFromQty("10.000")).toBe(10000);
  });

  it("ante ausencia o basura cae a 1, NUNCA a 0", () => {
    // Un 0 aquí sería una división por cero o un tramo que aplica a todo.
    for (const v of [undefined, "", "n/a"]) {
      expect(intFromQty(v as string)).toBe(1);
    }
  });
});

describe("parseAreaCm2 — el sentinel que costó un marcaje a 0 €", () => {
  it("lee el sentinel del feed como 999.999 cm², no como mil", () => {
    // Con parseFloat a secas esto daba ~1000 y dejaba fuera de rango
    // cualquier área grande → el marcaje no encontraba tramo y salía a 0 €.
    expect(parseAreaCm2("999.999")).toBe(999999);
  });

  it("una espalda de sudadera cae DENTRO del rango del sentinel", () => {
    const espalda = parseAreaCm2("1.120");
    const techo = parseAreaCm2("999.999");
    expect(espalda).toBe(1120);
    expect(espalda!).toBeLessThan(techo!);
  });

  it("distingue ausencia (null) de área cero", () => {
    // null = el feed no dice nada; 0 = dice que es cero. No son lo mismo.
    expect(parseAreaCm2(null)).toBeNull();
    expect(parseAreaCm2(undefined)).toBeNull();
    expect(parseAreaCm2("")).toBeNull();
    expect(parseAreaCm2("0")).toBe(0);
  });

  it("acepta decimales con coma", () => {
    expect(parseAreaCm2("12,5")).toBe(12.5);
  });

  it("devuelve null ante basura, no NaN", () => {
    expect(parseAreaCm2("n/a")).toBeNull();
  });
});
