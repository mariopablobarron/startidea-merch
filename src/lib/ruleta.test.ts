import { describe, it, expect } from "vitest";
import {
  pickPrize,
  generateCouponCode,
  DEFAULT_RULETA_PRIZES,
  type RuletaPrize,
} from "./ruleta";

/**
 * Tests de la lógica pura de la ruleta de premios. Protege el endurecimiento
 * del 2026-06-22 (selección ponderada determinista + fallbacks que evitan
 * devolver undefined / crashear el endpoint de spin). Es lógica de dinero
 * (decide qué cupón se crea), así que conviene blindarla.
 */

const FIX: RuletaPrize[] = [
  { id: "a", label: "A", short: "A", kind: "perk", weight: 1 },
  { id: "b", label: "B", short: "B", kind: "perk", weight: 1 },
  { id: "c", label: "C", short: "C", kind: "percent", weight: 2, value: 5 },
]; // total = 4

describe("pickPrize", () => {
  it("es determinista con seed y respeta los tramos de peso", () => {
    // pesos acumulados: a=[0], b=[1], c=[2,3]
    expect(pickPrize(FIX, 0).id).toBe("a");
    expect(pickPrize(FIX, 1).id).toBe("b");
    expect(pickPrize(FIX, 2).id).toBe("c");
    expect(pickPrize(FIX, 3).id).toBe("c");
  });

  it("el seed envuelve por el total (seed % total)", () => {
    expect(pickPrize(FIX, 4).id).toBe(pickPrize(FIX, 0).id); // 4 % 4 = 0
    expect(pickPrize(FIX, 7).id).toBe(pickPrize(FIX, 3).id); // 7 % 4 = 3
  });

  it("ignora premios con peso 0", () => {
    const prizes: RuletaPrize[] = [
      { id: "off", label: "Off", short: "Off", kind: "perk", weight: 0 },
      { id: "on", label: "On", short: "On", kind: "perk", weight: 5 },
    ];
    for (let s = 0; s < 5; s++) expect(pickPrize(prizes, s).id).toBe("on");
  });

  it("nunca devuelve undefined ante cualquier seed válido", () => {
    for (let s = 0; s < 50; s++) {
      const p = pickPrize(DEFAULT_RULETA_PRIZES, s);
      expect(p).toBeTruthy();
      expect(typeof p.id).toBe("string");
    }
  });

  it("fallback: si todos los pesos son 0, devuelve el primero (no undefined)", () => {
    const allZero: RuletaPrize[] = [
      { id: "x", label: "X", short: "X", kind: "perk", weight: 0 },
      { id: "y", label: "Y", short: "Y", kind: "perk", weight: 0 },
    ];
    expect(pickPrize(allZero).id).toBe("x");
  });

  it("fallback: lista vacía → cae a DEFAULT_RULETA_PRIZES[0] (no crashea)", () => {
    const p = pickPrize([]);
    expect(p).toBeTruthy();
    expect(p.id).toBe(DEFAULT_RULETA_PRIZES[0].id);
  });
});

describe("generateCouponCode", () => {
  it("formato RUL-<ID>-<6 alfanum mayúsculas>", () => {
    const code = generateCouponCode("p5");
    expect(code).toMatch(/^RUL-P5-[A-Z0-9]{6}$/);
  });

  it("incluye el id en mayúsculas y es razonablemente único", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCouponCode("envio")));
    expect(codes.size).toBeGreaterThan(195); // colisiones casi nulas
    for (const c of codes) expect(c.startsWith("RUL-ENVIO-")).toBe(true);
  });
});

describe("DEFAULT_RULETA_PRIZES", () => {
  it("no está vacío y tiene ids únicos", () => {
    expect(DEFAULT_RULETA_PRIZES.length).toBeGreaterThan(0);
    const ids = DEFAULT_RULETA_PRIZES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todos tienen peso > 0 y kind válido", () => {
    for (const p of DEFAULT_RULETA_PRIZES) {
      expect(p.weight).toBeGreaterThan(0);
      expect(["perk", "percent", "fixed"]).toContain(p.kind);
    }
  });

  it("los descuentos (percent/fixed) llevan value; los perks llevan perkNote", () => {
    for (const p of DEFAULT_RULETA_PRIZES) {
      if (p.kind === "percent") expect(p.value && p.value >= 1 && p.value <= 100).toBeTruthy();
      if (p.kind === "fixed") expect(p.value && p.value > 0).toBeTruthy();
      if (p.kind === "perk") expect(typeof p.perkNote).toBe("string");
    }
  });
});
