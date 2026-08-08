import { describe, it, expect, vi, beforeEach } from "vitest";

const couponUpdateMany = vi.fn();
const redemptionFindUnique = vi.fn();
const redemptionCreate = vi.fn();
const redemptionDelete = vi.fn();

// El cliente de transacción comparte los mismos espías que el de fuera: lo que
// se quiere fijar aquí es QUÉ operaciones se emiten y en qué orden, no si van
// dentro o fuera de la transacción.
const tx = {
  coupon: {
    updateMany: (...a: unknown[]) => couponUpdateMany(...a),
    fields: { maxUses: "__ref:maxUses" },
  },
  couponRedemption: {
    findUnique: (...a: unknown[]) => redemptionFindUnique(...a),
    create: (...a: unknown[]) => redemptionCreate(...a),
    delete: (...a: unknown[]) => redemptionDelete(...a),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupon: {
      updateMany: (...a: unknown[]) => couponUpdateMany(...a),
      fields: { maxUses: "__ref:maxUses" },
    },
    couponRedemption: {
      findUnique: (...a: unknown[]) => redemptionFindUnique(...a),
      create: (...a: unknown[]) => redemptionCreate(...a),
      delete: (...a: unknown[]) => redemptionDelete(...a),
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

import { claimCouponUse, releaseCouponUse, recordCouponRedemption } from "./coupons";

/**
 * Tests del cerrojo de usos de cupón (2026-08-04).
 *
 * Contexto: `validateCoupon` es una LECTURA, no un cerrojo — dos peticiones
 * concurrentes la pasan las dos. El uso real se reserva con `claimCouponUse`,
 * que debe emitirse ANTES de restar el descuento del importe que se persiste y
 * se cobra. Antes de este cambio el uso se reclamaba después de haber creado el
 * CartQuote con `acceptedTotalCents` ya rebajado y su link de pago emitido, con
 * lo que la perdedora de la carrera conservaba un carrito descontado y cobrable.
 *
 * Lo que fijan estos tests es justamente eso: que reservar consume, que
 * registrar la redención NO vuelve a consumir, y que un fallo posterior
 * devuelve el uso en vez de quemarlo.
 */

beforeEach(() => {
  couponUpdateMany.mockReset();
  redemptionFindUnique.mockReset();
  redemptionCreate.mockReset();
  redemptionDelete.mockReset();
});

describe("claimCouponUse — reserva atómica", () => {
  it("devuelve true cuando la BD confirma que reservó exactamente un uso", async () => {
    couponUpdateMany.mockResolvedValue({ count: 1 });
    await expect(claimCouponUse("c1")).resolves.toBe(true);
  });

  it("devuelve false cuando el cupo se agotó (count 0), sin lanzar", async () => {
    couponUpdateMany.mockResolvedValue({ count: 0 });
    await expect(claimCouponUse("c1")).resolves.toBe(false);
  });

  it("la reserva es un solo UPDATE condicionado a usedCount < maxUses", async () => {
    couponUpdateMany.mockResolvedValue({ count: 1 });
    await claimCouponUse("c1");

    expect(couponUpdateMany).toHaveBeenCalledTimes(1);
    const [args] = couponUpdateMany.mock.calls[0] as [
      { where: { id: string; OR: unknown[] }; data: { usedCount: { increment: number } } },
    ];
    // La condición viaja en el WHERE (la decide el motor de BD), no en JS:
    // es lo que impide que dos peticiones concurrentes ganen las dos.
    expect(args.where.id).toBe("c1");
    expect(args.where.OR).toEqual([
      { maxUses: null },
      { usedCount: { lt: "__ref:maxUses" } },
    ]);
    expect(args.data.usedCount).toEqual({ increment: 1 });
  });

  it("un cupón sin límite (maxUses null) también se reserva por la misma vía", async () => {
    couponUpdateMany.mockResolvedValue({ count: 1 });
    await expect(claimCouponUse("ilimitado")).resolves.toBe(true);
    const [args] = couponUpdateMany.mock.calls[0] as [{ where: { OR: unknown[] } }];
    expect(args.where.OR).toContainEqual({ maxUses: null });
  });
});

describe("releaseCouponUse — devolver un uso reservado", () => {
  it("decrementa el uso cuando la operación posterior no llegó a completarse", async () => {
    couponUpdateMany.mockResolvedValue({ count: 1 });
    await releaseCouponUse("c1");

    const [args] = couponUpdateMany.mock.calls[0] as [
      { where: { id: string }; data: { usedCount: { decrement: number } } },
    ];
    expect(args.where.id).toBe("c1");
    expect(args.data.usedCount).toEqual({ decrement: 1 });
  });

  it("nunca puede dejar el contador en negativo (guard usedCount > 0)", async () => {
    couponUpdateMany.mockResolvedValue({ count: 0 });
    await releaseCouponUse("c1");

    const [args] = couponUpdateMany.mock.calls[0] as [{ where: { usedCount: unknown } }];
    expect(args.where.usedCount).toEqual({ gt: 0 });
  });
});

describe("recordCouponRedemption — contabilidad, NO consumo", () => {
  it("NO incrementa usedCount: el uso ya se consumió al reservar", async () => {
    redemptionFindUnique.mockResolvedValue(null);
    redemptionCreate.mockResolvedValue({});

    await recordCouponRedemption("cart-1", "c1", 500);

    // Éste es el invariante que evita el doble consumo: si esta función
    // volviera a incrementar, cada carrito gastaría DOS usos del cupón.
    const incrementos = couponUpdateMany.mock.calls.filter((call) => {
      const args = call[0] as { data?: { usedCount?: { increment?: number } } };
      return args?.data?.usedCount?.increment != null;
    });
    expect(incrementos).toHaveLength(0);
  });

  it("registra la redención con el descuento exacto que se restó del importe", async () => {
    redemptionFindUnique.mockResolvedValue(null);
    redemptionCreate.mockResolvedValue({});

    await recordCouponRedemption("cart-1", "c1", 1234);

    expect(redemptionCreate).toHaveBeenCalledWith({
      data: { cartId: "cart-1", couponId: "c1", discountCents: 1234 },
    });
  });

  it("si el carrito ya tenía cupón, devuelve el uso del anterior antes de sustituirlo", async () => {
    redemptionFindUnique.mockResolvedValue({ cartId: "cart-1", couponId: "viejo" });
    redemptionCreate.mockResolvedValue({});
    couponUpdateMany.mockResolvedValue({ count: 1 });

    await recordCouponRedemption("cart-1", "nuevo", 300);

    const [args] = couponUpdateMany.mock.calls[0] as [
      { where: { id: string; usedCount: unknown }; data: { usedCount: { decrement: number } } },
    ];
    expect(args.where.id).toBe("viejo");
    expect(args.data.usedCount).toEqual({ decrement: 1 });
    // También aquí el decremento está protegido contra bajar de cero.
    expect(args.where.usedCount).toEqual({ gt: 0 });
    expect(redemptionDelete).toHaveBeenCalledWith({ where: { cartId: "cart-1" } });
  });

  it("sustituir un cupón devuelve exactamente un uso, no más", async () => {
    redemptionFindUnique.mockResolvedValue({ cartId: "cart-1", couponId: "viejo" });
    redemptionCreate.mockResolvedValue({});
    couponUpdateMany.mockResolvedValue({ count: 1 });

    await recordCouponRedemption("cart-1", "nuevo", 300);

    expect(couponUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe("carrera sobre el último uso disponible", () => {
  it("de dos peticiones concurrentes sobre maxUses=1, sólo una se lleva el descuento", async () => {
    // La BD arbitra: la primera consigue count 1, la segunda count 0.
    couponUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [a, b] = await Promise.all([claimCouponUse("ultimo"), claimCouponUse("ultimo")]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});
