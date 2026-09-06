import { describe, it, expect } from "vitest";
import { XMLParser } from "fast-xml-parser";
import {
  parseFeedCount,
  normalizeFeedRef,
  markingCmToMm,
  parseFeedFlag,
  esStockImplausible,
  esAreaMarcajeImplausible,
} from "./feed-units";

/**
 * Los números de estos tests son los del catálogo real, no ejemplos:
 *
 *   ref. 2555 → +90.000 en el proveedor, «90 uds» en la web
 *   ref. 2754 → +160.000 en el proveedor, «160 uds» en la web
 *   áreas de marcaje de esos vasos: 150 × 70 mm y 170 × 70 mm,
 *   publicadas como 15 × 7 mm y 17 × 7 mm
 */

describe("parseFeedCount — el punto del feed son millares", () => {
  it("lee el stock real de los dos vasos que estaban mal en la web", () => {
    expect(parseFeedCount("90.000")).toBe(90000);
    expect(parseFeedCount("160.000")).toBe(160000);
    expect(parseFeedCount("100.000")).toBe(100000);
  });

  it("aguanta el prefijo «+» con el que el proveedor marca el stock alto", () => {
    expect(parseFeedCount("+100.000")).toBe(100000);
    expect(parseFeedCount("+90.000")).toBe(90000);
  });

  it("una cantidad no tiene decimales: se queda con la parte entera", () => {
    expect(parseFeedCount("1.234,56")).toBe(1234);
    expect(parseFeedCount("12,9")).toBe(12);
  });

  it("no toca las cantidades que ya vienen limpias", () => {
    expect(parseFeedCount("160000")).toBe(160000);
    expect(parseFeedCount("250")).toBe(250);
    expect(parseFeedCount(4200)).toBe(4200);
    expect(parseFeedCount("0")).toBe(0);
  });

  it("distingue ausencia (null) de agotado (0)", () => {
    // Devolver 0 ante un campo que falta publicaría «agotado» en la ficha de
    // un producto del que no sabemos nada.
    for (const v of [null, undefined, "", "   ", "n/a", "-"]) {
      expect(parseFeedCount(v)).toBeNull();
    }
    expect(parseFeedCount("0")).toBe(0);
  });

  it("nunca devuelve NaN", () => {
    for (const v of ["abc", {}, [], "n/a"]) {
      const out = parseFeedCount(v);
      expect(out === null || Number.isInteger(out)).toBe(true);
    }
  });
});

describe("el XML crudo es la única forma de que la cantidad llegue entera", () => {
  const xml =
    "<catalog><product><matnr>2555</matnr><stock>90.000</stock></product></catalog>";

  it("con parseTagValue:true el parser se come el millar ANTES de que lo veamos", () => {
    // Este test documenta la causa raíz: no es que parseáramos mal el string,
    // es que nunca llegábamos a ver el string.
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
    const stock = parser.parse(xml).catalog.product.stock;
    expect(stock).toBe(90); // ← el «90 uds» de la web
  });

  it("con parseTagValue:false llega el texto y la cantidad sale correcta", () => {
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
    const stock = parser.parse(xml).catalog.product.stock;
    expect(stock).toBe("90.000");
    expect(parseFeedCount(stock)).toBe(90000);
  });
});

describe("normalizeFeedRef — leer el XML en crudo no puede duplicar productos", () => {
  it("quita los ceros a la izquierda igual que hacía la coerción a número", () => {
    expect(normalizeFeedRef("0034")).toBe("34");
    expect(normalizeFeedRef(34)).toBe("34");
    expect(normalizeFeedRef("2555")).toBe("2555");
  });

  it("no toca las referencias que no son solo dígitos", () => {
    expect(normalizeFeedRef("AD-448")).toBe("AD-448");
    expect(normalizeFeedRef(" 0A1 ")).toBe("0A1");
  });

  it("una referencia de ceros no se queda vacía", () => {
    expect(normalizeFeedRef("000")).toBe("0");
  });
});

describe("markingCmToMm — los centímetros del proveedor en la BD son mm", () => {
  it("convierte las áreas reales de los dos vasos", () => {
    expect(markingCmToMm(15)).toBe(150);
    expect(markingCmToMm(7)).toBe(70);
    expect(markingCmToMm(17)).toBe(170);
  });

  it("acepta decimales, con punto o con coma", () => {
    expect(markingCmToMm(8.5)).toBe(85);
    expect(markingCmToMm("8,5")).toBe(85);
  });

  it("sin medida devuelve null, no cero", () => {
    for (const v of [null, undefined, "", 0, -3, "n/a"]) {
      expect(markingCmToMm(v)).toBeNull();
    }
  });
});

describe("parseFeedFlag", () => {
  it("entiende las formas en que el feed dice sí y no", () => {
    for (const v of ["S", "si", "Sí", "Y", "1", "true"]) expect(parseFeedFlag(v)).toBe(true);
    for (const v of ["N", "no", "0", "false"]) expect(parseFeedFlag(v)).toBe(false);
  });

  it("ante silencio o algo desconocido no inventa", () => {
    for (const v of [null, undefined, "", "quizá"]) expect(parseFeedFlag(v)).toBeNull();
  });
});

describe("la red: valores que no pueden ser ciertos", () => {
  it("un producto disponible con menos de 10 uds es un ÷1.000", () => {
    // Exactamente lo que publicaba la web: 90 y 160 uds no dispararían esta
    // red, pero el mismo fallo sobre un stock de 9.000 sí — por eso la red es
    // el complemento del parser, no su sustituto.
    expect(esStockImplausible({ qty: 3, disponible: true })).toBe(true);
    expect(esStockImplausible({ qty: 9, disponible: null })).toBe(true);
  });

  it("agotado (0) es perfectamente posible y no salta", () => {
    expect(esStockImplausible({ qty: 0, disponible: true })).toBe(false);
    expect(esStockImplausible({ qty: 0, disponible: false })).toBe(false);
  });

  it("si el proveedor dice que NO está disponible, un stock bajo no es sospechoso", () => {
    expect(esStockImplausible({ qty: 4, disponible: false })).toBe(false);
  });

  it("un stock normal no salta", () => {
    expect(esStockImplausible({ qty: 250, disponible: true })).toBe(false);
    expect(esStockImplausible({ qty: 90000, disponible: true })).toBe(false);
  });

  it("sin dato de stock no hay sospecha", () => {
    expect(esStockImplausible({ qty: null, disponible: true })).toBe(false);
  });

  it("un área de marcaje por debajo de 5 mm es imposible de imprimir", () => {
    // Los valores que publicaba la web tras el ÷10: 15 × 7 mm y 17 × 7 mm.
    // El lado de 7 mm salta; el de 15 mm no — de ahí que la red no baste sola.
    expect(esAreaMarcajeImplausible(7)).toBe(false); // 7 mm ≥ 5: no lo pilla
    expect(esAreaMarcajeImplausible(4)).toBe(true);
    expect(esAreaMarcajeImplausible(1.5)).toBe(true);
  });

  it("un área normal y la ausencia de área no saltan", () => {
    expect(esAreaMarcajeImplausible(150)).toBe(false);
    expect(esAreaMarcajeImplausible(70)).toBe(false);
    expect(esAreaMarcajeImplausible(null)).toBe(false);
    expect(esAreaMarcajeImplausible(undefined)).toBe(false);
  });
});
