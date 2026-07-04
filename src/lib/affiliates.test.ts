import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
const couponFindUnique = vi.fn();
const ledgerFindMany = vi.fn();
const transaction = vi.fn();
const ledgerCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    affiliateLedgerEntry: {
      groupBy: (...a: unknown[]) => groupBy(...a),
      findMany: (...a: unknown[]) => ledgerFindMany(...a),
      create: (...a: unknown[]) => ledgerCreate(...a),
    },
    coupon: {
      findUnique: (...a: unknown[]) => couponFindUnique(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

import { getAffiliateBalance, recordCouponRedemption } from "./affiliates";

/**
 * Tests de src/lib/affiliates.ts — comisiones de afiliados.
 *
 * `getAffiliateBalance`: aritmética pura de agregados (sumas/restas) sobre
 * filas ya agrupadas por Prisma — mockeamos `groupBy` para controlar el
 * dataset y testear el cálculo de saldos.
 *
 * `recordCouponRedemption`: calcula la comisión SOBRE EL TOTAL COBRADO
 * (cartTotalCents), no sobre un depósito — ver comentario en affiliates.ts:91-93
 * ("las comisiones se devengan sobre lo que realmente cobra el negocio, no
 * sobre el bruto pre-descuento"). Mockeamos coupon.findUnique + $transaction
 * para testear esa fórmula (commissionPct/creditPct % del total) y la
 * idempotencia por cart.
 */

beforeEach(() => {
  groupBy.mockReset();
  couponFindUnique.mockReset();
  ledgerFindMany.mockReset();
  transaction.mockReset();
  ledgerCreate.mockReset();
  ledgerCreate.mockImplementation((args: unknown) => ({ id: "entry", ...(args as object) }));
  transaction.mockImplementation(async (arg: unknown) => {
    // prisma.$transaction([...]) recibe un array de promesas ya creadas por
    // prisma.affiliateLedgerEntry.create(...) — para el test basta con
    // resolverlas y devolver el array resuelto.
    if (Array.isArray(arg)) return Promise.all(arg);
    return arg;
  });
});

describe("getAffiliateBalance", () => {
  it("sin ninguna entry en el ledger, todos los saldos son 0", async () => {
    groupBy.mockResolvedValueOnce([]);
    const bal = await getAffiliateBalance("partner-1");
    expect(bal).toEqual({
      partnerId: "partner-1",
      commissionEarned: 0,
      commissionPaid: 0,
      commissionPending: 0,
      creditEarned: 0,
      creditUsed: 0,
      creditAvailable: 0,
    });
  });

  it("commissionPending = earned - paid", async () => {
    groupBy.mockResolvedValueOnce([
      { kind: "COMMISSION", _sum: { amountCents: 10000 } },
      { kind: "PAYOUT", _sum: { amountCents: -4000 } }, // payouts se guardan en negativo
    ]);
    const bal = await getAffiliateBalance("partner-1");
    expect(bal.commissionEarned).toBe(10000);
    expect(bal.commissionPaid).toBe(4000); // Math.abs
    expect(bal.commissionPending).toBe(6000);
  });

  it("creditAvailable = earned - used", async () => {
    groupBy.mockResolvedValueOnce([
      { kind: "CREDIT", _sum: { amountCents: 5000 } },
      { kind: "CREDIT_USED", _sum: { amountCents: -2000 } },
    ]);
    const bal = await getAffiliateBalance("partner-1");
    expect(bal.creditEarned).toBe(5000);
    expect(bal.creditUsed).toBe(2000);
    expect(bal.creditAvailable).toBe(3000);
  });

  it("ADJUSTMENT positivo se suma a commissionEarned y a pending", async () => {
    groupBy.mockResolvedValueOnce([
      { kind: "COMMISSION", _sum: { amountCents: 10000 } },
      { kind: "ADJUSTMENT", _sum: { amountCents: 1500 } },
    ]);
    const bal = await getAffiliateBalance("partner-1");
    expect(bal.commissionEarned).toBe(11500);
    expect(bal.commissionPending).toBe(11500);
  });

  it("ADJUSTMENT negativo NO resta de commissionEarned (solo Math.max(0,...)) pero SÍ resta de pending", async () => {
    // Esto documenta el comportamiento real de affiliates.ts:44-47: el
    // "earned" que se muestra usa Math.max(0, adjustment) — un ajuste
    // negativo no reduce el "ganado" mostrado — pero "pending" SÍ usa el
    // adjustment crudo (sin el max), así que si el ajuste es negativo,
    // pending puede ser MENOR que (commissionEarned mostrado - paid).
    groupBy.mockResolvedValueOnce([
      { kind: "COMMISSION", _sum: { amountCents: 10000 } },
      { kind: "ADJUSTMENT", _sum: { amountCents: -3000 } },
    ]);
    const bal = await getAffiliateBalance("partner-1");
    expect(bal.commissionEarned).toBe(10000); // no baja de 10000
    expect(bal.commissionPending).toBe(7000); // 10000 + (-3000) - 0
  });
});

describe("recordCouponRedemption — cálculo de comisión sobre el TOTAL cobrado", () => {
  it("calcula commissionCents y creditCents como % del cartTotalCents (no del bruto)", async () => {
    couponFindUnique.mockResolvedValueOnce({
      id: "coupon-1",
      code: "PARTNER10",
      affiliate: { id: "partner-1", active: true, commissionPct: 10, creditPct: 5 },
      commissionPctOverride: null,
      creditPctOverride: null,
    });
    ledgerFindMany.mockResolvedValueOnce([]); // sin entries previas → no idempotente-skip

    const res = await recordCouponRedemption({
      cartId: "cart-1",
      couponId: "coupon-1",
      cartTotalCents: 100000, // 1.000€ ya con el descuento del cupón aplicado
    });

    expect(res).not.toBeNull();
    expect(res?.commissionCents).toBe(10000); // 10% de 1.000€
    expect(res?.creditCents).toBe(5000); // 5% de 1.000€
  });

  it("un override en el cupón gana sobre el % del partner", async () => {
    couponFindUnique.mockResolvedValueOnce({
      id: "coupon-1",
      code: "PARTNER10",
      affiliate: { id: "partner-1", active: true, commissionPct: 10, creditPct: 5 },
      commissionPctOverride: 20,
      creditPctOverride: 0,
    });
    ledgerFindMany.mockResolvedValueOnce([]);

    const res = await recordCouponRedemption({
      cartId: "cart-1",
      couponId: "coupon-1",
      cartTotalCents: 100000,
    });

    expect(res?.commissionCents).toBe(20000); // override 20%, no el 10% del partner
    expect(res?.creditCents).toBe(0); // override 0%
  });

  it("cupón sin afiliado devuelve null sin tocar el ledger", async () => {
    couponFindUnique.mockResolvedValueOnce({
      id: "coupon-1",
      code: "GENERICO",
      affiliate: null,
    });

    const res = await recordCouponRedemption({
      cartId: "cart-1",
      couponId: "coupon-1",
      cartTotalCents: 100000,
    });

    expect(res).toBeNull();
    expect(ledgerFindMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("afiliado inactivo tampoco genera comisión", async () => {
    couponFindUnique.mockResolvedValueOnce({
      id: "coupon-1",
      code: "PARTNER10",
      affiliate: { id: "partner-1", active: false, commissionPct: 10, creditPct: 5 },
    });

    const res = await recordCouponRedemption({
      cartId: "cart-1",
      couponId: "coupon-1",
      cartTotalCents: 100000,
    });

    expect(res).toBeNull();
  });

  it("es idempotente: si ya hay entries COMMISSION/CREDIT para ese cart, no duplica", async () => {
    couponFindUnique.mockResolvedValueOnce({
      id: "coupon-1",
      code: "PARTNER10",
      affiliate: { id: "partner-1", active: true, commissionPct: 10, creditPct: 5 },
      commissionPctOverride: null,
      creditPctOverride: null,
    });
    ledgerFindMany.mockResolvedValueOnce([{ id: "existing-entry" }]); // ya procesado

    const res = await recordCouponRedemption({
      cartId: "cart-1",
      couponId: "coupon-1",
      cartTotalCents: 100000,
    });

    expect(res).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("cartTotalCents 0 no crea ninguna entry (0% de 0 = 0, filtrado por > 0)", async () => {
    couponFindUnique.mockResolvedValueOnce({
      id: "coupon-1",
      code: "PARTNER10",
      affiliate: { id: "partner-1", active: true, commissionPct: 10, creditPct: 5 },
      commissionPctOverride: null,
      creditPctOverride: null,
    });
    ledgerFindMany.mockResolvedValueOnce([]);

    const res = await recordCouponRedemption({
      cartId: "cart-1",
      couponId: "coupon-1",
      cartTotalCents: 0,
    });

    expect(res?.commissionCents).toBe(0);
    expect(res?.creditCents).toBe(0);
    // $transaction se llama con un array vacío (ninguna entry > 0 a crear).
    expect(transaction).toHaveBeenCalledWith([]);
  });
});
