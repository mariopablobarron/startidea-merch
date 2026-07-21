import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  formatMoney,
  defaultTiersFromBase,
  estimateBaseCentsFromName,
  pickTier,
  totalForQty,
  marginMultiplier,
  applyMargin,
  orderTotalCents,
  type PriceTier,
} from "./pricing";

describe("formatMoney", () => {
  it("formatea céntimos a euros es-ES con 2 decimales", () => {
    expect(formatMoney(130).formatted).toMatch(/1,30\s*€/);
    expect(formatMoney(130).cents).toBe(130);
  });
  it("0 céntimos → 0,00 €", () => {
    expect(formatMoney(0).formatted).toMatch(/0,00\s*€/);
  });
});

describe("defaultTiersFromBase", () => {
  it("base 0 o negativa → sin tramos (nunca inventa precio)", () => {
    expect(defaultTiersFromBase(0)).toEqual([]);
    expect(defaultTiersFromBase(-100)).toEqual([]);
  });

  it("devuelve los 5 tramos canónicos 10/25/50/100/250 marcados como ESTIMATE", () => {
    const t = defaultTiersFromBase(1000);
    expect(t.map((x) => x.minQty)).toEqual([10, 25, 50, 100, 250]);
    expect(t.every((x) => x.source === "ESTIMATE")).toBe(true);
  });

  it("INVARIANTE DE DINERO: el precio unitario decrece de forma estricta al subir la cantidad", () => {
    const t = defaultTiersFromBase(837); // base "fea" para pillar redondeos
    for (let i = 1; i < t.length; i++) {
      expect(t[i].unitPriceCents).toBeLessThan(t[i - 1].unitPriceCents);
    }
  });

  it("el tramo de 10 uds cuesta el 100% del base; ninguno lo supera", () => {
    const base = 480;
    const t = defaultTiersFromBase(base);
    expect(t[0].unitPriceCents).toBe(base);
    expect(Math.max(...t.map((x) => x.unitPriceCents))).toBe(base);
  });

  it("badges: POPULAR en 25, MAS_ECONOMICO en 250", () => {
    const t = defaultTiersFromBase(1000);
    expect(t.find((x) => x.minQty === 25)?.badge).toBe("POPULAR");
    expect(t.find((x) => x.minQty === 250)?.badge).toBe("MAS_ECONOMICO");
    expect(t.find((x) => x.minQty === 10)?.badge).toBeUndefined();
  });
});

describe("estimateBaseCentsFromName", () => {
  it("mapea tipos conocidos por nombre", () => {
    expect(estimateBaseCentsFromName("Bolígrafo azul")).toBe(80);
    expect(estimateBaseCentsFromName("Taza cerámica")).toBe(320);
    expect(estimateBaseCentsFromName("Mochila urbana")).toBe(1450);
    expect(estimateBaseCentsFromName("Camiseta algodón")).toBe(380);
  });
  it("usa también la categoría, no solo el nombre", () => {
    expect(estimateBaseCentsFromName("Regalo genérico", "Tazas y mug")).toBe(320);
  });
  it("desconocido → fallback 350", () => {
    expect(estimateBaseCentsFromName("Artilugio inclasificable")).toBe(350);
  });
});

describe("pickTier", () => {
  const tiers: PriceTier[] = [
    { minQty: 10, unitPriceCents: 100, source: "ESTIMATE" },
    { minQty: 50, unitPriceCents: 62, source: "ESTIMATE" },
    { minQty: 250, unitPriceCents: 32, source: "ESTIMATE" },
  ];

  it("sin tramos → undefined", () => {
    expect(pickTier([], 100)).toBeUndefined();
  });
  it("cantidad por debajo del mínimo → el tramo más pequeño (no undefined)", () => {
    expect(pickTier(tiers, 1)?.minQty).toBe(10);
  });
  it("elige el mayor tramo cuyo minQty no supera la cantidad", () => {
    expect(pickTier(tiers, 10)?.minQty).toBe(10);
    expect(pickTier(tiers, 49)?.minQty).toBe(10);
    expect(pickTier(tiers, 50)?.minQty).toBe(50);
    expect(pickTier(tiers, 999)?.minQty).toBe(250);
  });
  it("no depende del orden de entrada (ordena internamente)", () => {
    const desordenado = [...tiers].reverse();
    expect(pickTier(desordenado, 60)?.minQty).toBe(50);
  });
});

describe("totalForQty", () => {
  const tiers: PriceTier[] = [
    { minQty: 10, unitPriceCents: 100, source: "ESTIMATE" },
    { minQty: 50, unitPriceCents: 62, source: "ESTIMATE" },
  ];
  it("multiplica el precio del tramo por la cantidad", () => {
    expect(totalForQty(tiers, 50)?.cents).toBe(62 * 50);
  });
  it("sin tramos → null", () => {
    expect(totalForQty([], 50)).toBeNull();
  });
});

describe("marginMultiplier / applyMargin", () => {
  const original = process.env.MARGIN_MULTIPLIER;
  beforeEach(() => {
    delete process.env.MARGIN_MULTIPLIER;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MARGIN_MULTIPLIER;
    else process.env.MARGIN_MULTIPLIER = original;
  });

  it("default 1,6 cuando no hay override ni env", () => {
    expect(marginMultiplier()).toBe(1.6);
  });
  it("el override manda sobre el env", () => {
    process.env.MARGIN_MULTIPLIER = "2.0";
    expect(marginMultiplier(1.4)).toBe(1.4);
  });
  it("lee el env cuando no hay override", () => {
    process.env.MARGIN_MULTIPLIER = "1.8";
    expect(marginMultiplier()).toBe(1.8);
  });
  it("SALVAGUARDA: valor inválido, 0 o negativo → 1,6 (nunca precio a coste o gratis)", () => {
    process.env.MARGIN_MULTIPLIER = "0";
    expect(marginMultiplier()).toBe(1.6);
    process.env.MARGIN_MULTIPLIER = "-3";
    expect(marginMultiplier()).toBe(1.6);
    process.env.MARGIN_MULTIPLIER = "abc";
    expect(marginMultiplier()).toBe(1.6);
    expect(marginMultiplier(0)).toBe(1.6);
  });
  it("applyMargin aplica y redondea coste→cliente", () => {
    expect(applyMargin(100)).toBe(160);
    expect(applyMargin(333, 1.5)).toBe(500); // 499,5 → 500
  });
});

describe("orderTotalCents", () => {
  it("sin promo → subtotal intacto", () => {
    expect(orderTotalCents(1000, null)).toBe(1000);
    expect(orderTotalCents(1000, undefined)).toBe(1000);
  });
  it("promo FIXED se resta una sola vez sobre el subtotal", () => {
    expect(orderTotalCents(1000, { value: 300 })).toBe(700);
  });
  it("INVARIANTE DE DINERO: el total nunca es negativo aunque el descuento supere el subtotal", () => {
    expect(orderTotalCents(200, { value: 500 })).toBe(0);
  });
  it("un value de promo negativo no infla el total (se clampa a 0)", () => {
    expect(orderTotalCents(1000, { value: -500 })).toBe(1000);
  });
});
