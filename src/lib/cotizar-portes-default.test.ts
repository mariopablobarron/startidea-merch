import { describe, it, expect } from "vitest";
import {
  buildSupplierShippingMap,
  decidePortesPreload,
  esPortesUsable,
  portesCentsAInput,
  MAX_PORTES_CENTS,
} from "./cotizar-portes-default";

const MAPA = { midocean: { cents: 1200, name: "MidOcean" } };

describe("esPortesUsable · cerrojo del importe de portes", () => {
  it("acepta 0 — un proveedor franco de portes es legítimo", () => {
    expect(esPortesUsable(0)).toBe(true);
  });

  it.each([
    ["negativo", -1],
    ["decimal", 12.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["por encima del techo", MAX_PORTES_CENTS + 1],
  ])("rechaza %s: bajaría el coste y con él el PVP sin que nadie lo vea", (_caso, valor) => {
    expect(esPortesUsable(valor)).toBe(false);
  });

  it.each([["texto", "1200"], ["null", null], ["undefined", undefined]])(
    "rechaza %s (no es número)",
    (_caso, valor) => {
      expect(esPortesUsable(valor)).toBe(false);
    },
  );
});

describe("buildSupplierShippingMap", () => {
  it("recoge solo los proveedores con portes configurados", () => {
    const map = buildSupplierShippingMap([
      { code: "midocean", name: "MidOcean", defaultShippingCents: 1200 },
      { code: "makito", name: "Makito", defaultShippingCents: null },
    ]);
    expect(map).toEqual({ midocean: { cents: 1200, name: "MidOcean" } });
  });

  it("acepta 0 (franco de portes) como valor configurado, no como 'sin valor'", () => {
    const map = buildSupplierShippingMap([{ code: "cifra", name: "Cifra", defaultShippingCents: 0 }]);
    expect(map.cifra).toEqual({ cents: 0, name: "Cifra" });
  });

  it("descarta importes imposibles en vez de dejarlos precargar", () => {
    const map = buildSupplierShippingMap([
      { code: "midocean", name: "MidOcean", defaultShippingCents: -500 },
      { code: "makito", name: "Makito", defaultShippingCents: 8.5 },
    ]);
    expect(map).toEqual({});
  });

  it("no revienta con respuestas rotas (la página traga el error del fetch)", () => {
    expect(buildSupplierShippingMap(undefined)).toEqual({});
    expect(buildSupplierShippingMap(null)).toEqual({});
    expect(buildSupplierShippingMap("nope")).toEqual({});
    expect(buildSupplierShippingMap([null, 3, { sinCode: 1 }])).toEqual({});
  });

  it("cae al código como nombre si la ficha no tiene uno", () => {
    const map = buildSupplierShippingMap([{ code: "adivin", defaultShippingCents: 900 }]);
    expect(map.adivin.name).toBe("adivin");
  });
});

describe("decidePortesPreload", () => {
  it("precarga en la primera búsqueda de un proveedor con default", () => {
    const d = decidePortesPreload({
      portesTouched: false,
      supplierCode: "midocean",
      currentPortesCents: 800,
      map: MAPA,
    });
    expect(d).toEqual({ preload: true, cents: 1200, name: "MidOcean" });
  });

  it("REGRESIÓN: no pisa los portes que el admin ha tecleado a mano", () => {
    // El fallo real no era «falta la condición», era que se leía tarde: dentro
    // de una función async, `portesTouched` era la foto del render anterior.
    // Aquí se pasa el valor ACTUAL, que es lo que la página lee de un ref.
    const d = decidePortesPreload({
      portesTouched: true,
      supplierCode: "midocean",
      currentPortesCents: 2500,
      map: MAPA,
    });
    expect(d.preload).toBe(false);
  });

  it("no dispara al reseleccionar técnica (no es una búsqueda nueva)", () => {
    const d = decidePortesPreload({
      techniqueCode: "SERI1",
      portesTouched: false,
      supplierCode: "midocean",
      currentPortesCents: 800,
      map: MAPA,
    });
    expect(d.preload).toBe(false);
  });

  it("corta la recursión: si ya se cotizó con ese importe, no vuelve a llamar", () => {
    const d = decidePortesPreload({
      portesTouched: false,
      supplierCode: "midocean",
      currentPortesCents: 1200,
      map: MAPA,
    });
    expect(d.preload).toBe(false);
  });

  it("no hace nada si el proveedor no tiene default (los 4 de hoy)", () => {
    const d = decidePortesPreload({
      portesTouched: false,
      supplierCode: "makito",
      currentPortesCents: 800,
      map: MAPA,
    });
    expect(d.preload).toBe(false);
  });

  it("no hace nada si la respuesta viene sin proveedor", () => {
    const d = decidePortesPreload({
      portesTouched: false,
      supplierCode: undefined,
      currentPortesCents: 800,
      map: MAPA,
    });
    expect(d.preload).toBe(false);
  });

  it("un default corrupto colado en el mapa no precarga: nunca cotizar de menos en silencio", () => {
    const d = decidePortesPreload({
      portesTouched: false,
      supplierCode: "midocean",
      currentPortesCents: 800,
      map: { midocean: { cents: -1200, name: "MidOcean" } },
    });
    expect(d.preload).toBe(false);
  });

  it("un default de 0 € SÍ precarga (franco de portes es una decisión real)", () => {
    const d = decidePortesPreload({
      portesTouched: false,
      supplierCode: "cifra",
      currentPortesCents: 800,
      map: { cifra: { cents: 0, name: "Cifra" } },
    });
    expect(d).toEqual({ preload: true, cents: 0, name: "Cifra" });
  });
});

describe("portesCentsAInput", () => {
  it.each([
    [1200, "12"],
    [850, "8,5"],
    [833, "8,33"],
    [0, "0"],
  ])("%i céntimos → %s", (cents, esperado) => {
    expect(portesCentsAInput(cents as number)).toBe(esperado);
  });
});
