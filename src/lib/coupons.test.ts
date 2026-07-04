import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));

import { validateCoupon } from "./coupons";

/**
 * Tests de src/lib/coupons.ts — `validateCoupon` es la parte "casi pura" del
 * módulo: 1 sola lectura a BD (el propio cupón) y luego toda la aritmética de
 * descuento es determinista. Mockeamos `prisma.coupon.findUnique` para
 * testear esa aritmética real (orden base → descuento) sin BD.
 *
 * `applyCoupon` NO se testea aquí: es una transacción Prisma de efectos
 * (crear/actualizar filas) sin lógica aritmética propia que aislar.
 */

function baseCoupon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "coupon-1",
    code: "PROMO10",
    active: true,
    kind: "PERCENT",
    percentValue: 10,
    fixedCents: null,
    validFrom: new Date("2020-01-01T00:00:00Z"),
    validUntil: null,
    maxUses: null,
    usedCount: 0,
    minTotalCents: null,
    ...overrides,
  };
}

beforeEach(() => {
  findUnique.mockReset();
});

describe("validateCoupon — casos básicos", () => {
  it("código vacío se rechaza sin tocar BD", async () => {
    const res = await validateCoupon("   ", 10000);
    expect(res.ok).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("normaliza el código a mayúsculas/trim antes de buscar", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon());
    await validateCoupon("  promo10 ", 10000);
    expect(findUnique).toHaveBeenCalledWith({ where: { code: "PROMO10" } });
  });

  it("cupón inexistente → no válido", async () => {
    findUnique.mockResolvedValueOnce(null);
    const res = await validateCoupon("NOPE", 10000);
    expect(res.ok).toBe(false);
  });

  it("cupón inactivo → no válido aunque exista", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ active: false }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(false);
  });
});

describe("validateCoupon — ventana de vigencia", () => {
  it("todavía no activo (validFrom en el futuro)", async () => {
    findUnique.mockResolvedValueOnce(
      baseCoupon({ validFrom: new Date(Date.now() + 86_400_000) }),
    );
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/aún no activo/i);
  });

  it("caducado (validUntil en el pasado)", async () => {
    findUnique.mockResolvedValueOnce(
      baseCoupon({ validUntil: new Date(Date.now() - 86_400_000) }),
    );
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/caducado/i);
  });

  it("validUntil en el futuro sí es válido", async () => {
    findUnique.mockResolvedValueOnce(
      baseCoupon({ validUntil: new Date(Date.now() + 86_400_000) }),
    );
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(true);
  });
});

describe("validateCoupon — límite de usos", () => {
  it("sin usos disponibles (usedCount >= maxUses)", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ maxUses: 5, usedCount: 5 }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/sin usos/i);
  });

  it("con usos restantes, pasa este check", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ maxUses: 5, usedCount: 4 }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(true);
  });
});

describe("validateCoupon — mínimo de pedido", () => {
  it("total por debajo del mínimo exigido se rechaza", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ minTotalCents: 20000 }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Mínimo de pedido/);
  });

  it("total igual al mínimo exacto sí pasa (no es estrictamente mayor)", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ minTotalCents: 20000 }));
    const res = await validateCoupon("PROMO10", 20000);
    expect(res.ok).toBe(true);
  });
});

describe("validateCoupon — cálculo de descuento PERCENT", () => {
  it("aplica el porcentaje sobre el total y redondea a céntimos", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ percentValue: 15 }));
    const res = await validateCoupon("PROMO10", 9999); // 9999 * 0.15 = 1499.85
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.discountCents).toBe(1500); // redondeado
  });

  it("clampa el porcentaje a un máximo de 100%", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ percentValue: 250 }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.discountCents).toBe(10000); // 100% del total, no 250%
  });

  // Bug cazado por estos tests y ARREGLADO (coupons.ts): antes, percentValue 0
  // (o null) aplicaba un 1% de descuento en silencio por el suelo Math.max(1,…).
  it("percentValue 0 no aplica ningún descuento (rechazado como no aplicable)", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ percentValue: 0 }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/no aplicable/i);
  });
});

describe("validateCoupon — cálculo de descuento FIXED", () => {
  it("descuenta el importe fijo en céntimos", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ kind: "FIXED", fixedCents: 500 }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.discountCents).toBe(500);
  });

  it("el descuento FIXED nunca supera el total del pedido (no negativos)", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ kind: "FIXED", fixedCents: 99999 }));
    const res = await validateCoupon("PROMO10", 1000);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.discountCents).toBe(1000); // clamp al total, no 999,99€
      expect(res.discountCents).toBeLessThanOrEqual(1000);
    }
  });

  it("fixedCents 0 no produce descuento válido", async () => {
    findUnique.mockResolvedValueOnce(baseCoupon({ kind: "FIXED", fixedCents: 0 }));
    const res = await validateCoupon("PROMO10", 10000);
    expect(res.ok).toBe(false);
  });
});

describe("validateCoupon — invariante orden base → descuento", () => {
  it("el descuento se calcula SIEMPRE sobre el total bruto pasado (sin IVA horneado)", async () => {
    // Documenta la semántica actual: validateCoupon recibe `totalCents` tal
    // cual el caller decida (aquí, base sin IVA por convención del sistema:
    // ver src/lib/iva.ts). El propio módulo no añade ni quita IVA — es
    // responsabilidad del caller pasar el importe correcto.
    findUnique.mockResolvedValueOnce(baseCoupon({ kind: "PERCENT", percentValue: 20 }));
    const totalBaseSinIva = 100000; // 1.000,00 € base
    const res = await validateCoupon("PROMO10", totalBaseSinIva);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.discountCents).toBe(20000); // 20% de 1.000€ = 200€
      expect(res.discountCents).toBeLessThan(totalBaseSinIva);
    }
  });
});
