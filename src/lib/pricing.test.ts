import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyMargin,
  marginMultiplier,
  orderTotalCents,
  pickTier,
  totalForQty,
  defaultTiersFromBase,
  formatMoney,
  type PriceTier,
} from "./pricing";

/**
 * Tests de src/lib/pricing.ts — funciones puras de margen y totales.
 * `product-pricing.test.ts` ya cubre `orderTotalCents`/`pickTier` de forma
 * indirecta (vía computeClientPricing); aquí se testean de forma aislada y se
 * añade cobertura de `applyMargin`, `marginMultiplier`, `totalForQty` y
 * `defaultTiersFromBase`, que no tenían test directo.
 */

describe("marginMultiplier / applyMargin", () => {
  const ORIGINAL_ENV = process.env.MARGIN_MULTIPLIER;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.MARGIN_MULTIPLIER;
    else process.env.MARGIN_MULTIPLIER = ORIGINAL_ENV;
  });

  it("por defecto (sin env ni override) usa 1,6×", () => {
    delete process.env.MARGIN_MULTIPLIER;
    expect(marginMultiplier()).toBe(1.6);
  });

  it("override explícito gana sobre el env", () => {
    process.env.MARGIN_MULTIPLIER = "2";
    expect(marginMultiplier(1.3)).toBe(1.3);
  });

  it("lee el multiplicador desde MARGIN_MULTIPLIER si no hay override", () => {
    process.env.MARGIN_MULTIPLIER = "2.5";
    expect(marginMultiplier()).toBe(2.5);
  });

  it("valores inválidos (NaN, 0, negativo) caen al default 1,6×", () => {
    process.env.MARGIN_MULTIPLIER = "no-es-un-numero";
    expect(marginMultiplier()).toBe(1.6);

    process.env.MARGIN_MULTIPLIER = "0";
    expect(marginMultiplier()).toBe(1.6);

    process.env.MARGIN_MULTIPLIER = "-3";
    expect(marginMultiplier()).toBe(1.6);
  });

  it("applyMargin redondea a céntimos enteros", () => {
    delete process.env.MARGIN_MULTIPLIER;
    expect(applyMargin(30)).toBe(48); // 30 * 1.6 = 48 exacto
    expect(applyMargin(33)).toBe(53); // 33 * 1.6 = 52.8 -> 53
    expect(applyMargin(0)).toBe(0);
  });

  it("applyMargin respeta un override de margen (p.ej. marginPct convertido a multiplicador)", () => {
    expect(applyMargin(30, 1.5)).toBe(45); // 30 * 1.5
  });

  it("applyMargin nunca produce fracciones de céntimo", () => {
    for (const cost of [1, 7, 33, 99, 12345]) {
      expect(Number.isInteger(applyMargin(cost))).toBe(true);
    }
  });
});

describe("orderTotalCents — descuento FIXED de pedido, una sola vez", () => {
  it("sin promo de pedido, devuelve el subtotal intacto", () => {
    expect(orderTotalCents(12000, null)).toBe(12000);
    expect(orderTotalCents(12000, undefined)).toBe(12000);
  });

  it("resta el FIXED una única vez sobre el subtotal", () => {
    expect(orderTotalCents(12000, { value: 500 })).toBe(11500);
  });

  it("nunca baja de 0 aunque el descuento supere el subtotal", () => {
    expect(orderTotalCents(300, { value: 500 })).toBe(0);
  });

  it("ignora un value negativo (Math.max(0, ...) interno) en vez de sumar al total", () => {
    // orderFixedPromo.value negativo no debe SUBIR el total.
    expect(orderTotalCents(1000, { value: -500 })).toBe(1000);
  });

  it("subtotal 0 con descuento produce 0 (no negativo)", () => {
    expect(orderTotalCents(0, { value: 500 })).toBe(0);
  });
});

describe("pickTier", () => {
  const tiers: PriceTier[] = [
    { minQty: 100, unitPriceCents: 45, source: "PROVIDER" },
    { minQty: 10, unitPriceCents: 80, source: "PROVIDER" },
    { minQty: 25, unitPriceCents: 62, source: "PROVIDER" },
  ];

  it("devuelve undefined si no hay tiers", () => {
    expect(pickTier([], 50)).toBeUndefined();
  });

  it("ordena por minQty internamente (no depende del orden de entrada)", () => {
    expect(pickTier(tiers, 30)?.unitPriceCents).toBe(62);
  });

  it("qty por debajo del primer tramo usa igualmente el primer tramo (fallback)", () => {
    expect(pickTier(tiers, 1)?.unitPriceCents).toBe(80);
  });

  it("qty exactamente en el límite de un tramo usa ese tramo", () => {
    expect(pickTier(tiers, 100)?.unitPriceCents).toBe(45);
    expect(pickTier(tiers, 99)?.unitPriceCents).toBe(62);
  });

  it("qty por encima de todos los tramos usa el más alto", () => {
    expect(pickTier(tiers, 100000)?.unitPriceCents).toBe(45);
  });
});

describe("totalForQty", () => {
  const tiers: PriceTier[] = [
    { minQty: 10, unitPriceCents: 80, source: "PROVIDER" },
    { minQty: 100, unitPriceCents: 45, source: "PROVIDER" },
  ];

  it("null si no hay tiers aplicables", () => {
    expect(totalForQty([], 50)).toBeNull();
  });

  it("multiplica el precio del tier elegido por la cantidad", () => {
    const total = totalForQty(tiers, 250);
    expect(total?.cents).toBe(45 * 250);
    expect(total?.formatted).toContain("€");
  });
});

describe("defaultTiersFromBase", () => {
  it("importe base 0 o negativo devuelve array vacío", () => {
    expect(defaultTiersFromBase(0)).toEqual([]);
    expect(defaultTiersFromBase(-100)).toEqual([]);
  });

  it("genera 5 tramos decrecientes con el primero = 100% del base", () => {
    const tiers = defaultTiersFromBase(1000);
    expect(tiers).toHaveLength(5);
    expect(tiers[0]).toMatchObject({ minQty: 10, unitPriceCents: 1000 });
    // Cada tramo posterior debe ser <= al anterior (curva decreciente).
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].unitPriceCents).toBeLessThanOrEqual(tiers[i - 1].unitPriceCents);
    }
  });

  it("marca los badges POPULAR y MAS_ECONOMICO en los tramos esperados", () => {
    const tiers = defaultTiersFromBase(1000);
    expect(tiers.find((t) => t.minQty === 25)?.badge).toBe("POPULAR");
    expect(tiers.find((t) => t.minQty === 250)?.badge).toBe("MAS_ECONOMICO");
  });

  it("todos los tramos quedan marcados como ESTIMATE", () => {
    const tiers = defaultTiersFromBase(1000);
    expect(tiers.every((t) => t.source === "ESTIMATE")).toBe(true);
  });
});

describe("formatMoney", () => {
  it("formatea céntimos a euros con 2 decimales y coma decimal es-ES", () => {
    // Nota: no comprobamos el separador de miles ("." en es-ES) porque
    // depende de los datos ICU disponibles en el runtime de Node (en CI/local
    // sin ICU completo, Intl.NumberFormat("es-ES") puede omitirlo). Lo que sí
    // es estable y es lo que importa financieramente: coma decimal + símbolo €.
    expect(formatMoney(150000).formatted).toMatch(/^1\.?500,00\s?€$/);
    expect(formatMoney(0).formatted).toMatch(/^0,00\s?€$/);
  });

  it("conserva los céntimos originales", () => {
    expect(formatMoney(4899).cents).toBe(4899);
  });
});
