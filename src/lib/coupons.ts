import { prisma } from "@/lib/prisma";
import type { Coupon } from "@prisma/client";

export type CouponValidation =
  | { ok: true; coupon: Coupon; discountCents: number }
  | { ok: false; reason: string };

/**
 * Valida un código de cupón frente a un total. NO consume usos — solo
 * verifica. Para consumir, usa applyCoupon().
 */
export async function validateCoupon(code: string, totalCents: number): Promise<CouponValidation> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, reason: "Código vacío" };

  const coupon = await prisma.coupon.findUnique({ where: { code: trimmed } });
  if (!coupon || !coupon.active) return { ok: false, reason: "Código no válido" };

  const now = new Date();
  if (coupon.validFrom > now) return { ok: false, reason: "Código aún no activo" };
  if (coupon.validUntil && coupon.validUntil < now) {
    return { ok: false, reason: "Código caducado" };
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: "Código sin usos disponibles" };
  }
  if (coupon.minTotalCents != null && totalCents < coupon.minTotalCents) {
    const min = (coupon.minTotalCents / 100).toFixed(2);
    return { ok: false, reason: `Mínimo de pedido ${min} € para este código` };
  }

  let discount = 0;
  if (coupon.kind === "PERCENT") {
    // Clamp 0..100: un PERCENT mal configurado a 0/null NO aplica descuento
    // (cae en el guard discount<=0 de abajo). Antes Math.max(1,...) imponía un
    // suelo del 1% en silencio — bug cazado por coupons.test.ts.
    const pct = Math.min(100, Math.max(0, coupon.percentValue || 0));
    discount = Math.round((totalCents * pct) / 100);
  } else if (coupon.kind === "FIXED") {
    discount = Math.min(totalCents, coupon.fixedCents || 0);
  }
  if (discount <= 0) return { ok: false, reason: "Descuento no aplicable" };

  return { ok: true, coupon, discountCents: discount };
}

/**
 * Aplica un cupón a un cart: registra CouponRedemption (única por cart),
 * incrementa usedCount. Si el carrito ya tiene cupón, lo sustituye.
 */
export async function applyCoupon(
  cartId: string,
  couponId: string,
  discountCents: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Si había uno previo, devolver el uso anterior
    const previous = await tx.couponRedemption.findUnique({ where: { cartId } });
    if (previous) {
      await tx.coupon.update({
        where: { id: previous.couponId },
        data: { usedCount: { decrement: 1 } },
      });
      await tx.couponRedemption.delete({ where: { cartId } });
    }
    await tx.couponRedemption.create({
      data: { cartId, couponId, discountCents },
    });
    // Incremento CONDICIONAL atómico: dos requests concurrentes podían pasar
    // ambas validateCoupon (lectura aislada) y superar maxUses. Si el cupo se
    // agotó entre la validación y aquí, count=0 → abortamos la transacción.
    const claimed = await tx.coupon.updateMany({
      where: {
        id: couponId,
        OR: [{ maxUses: null }, { usedCount: { lt: tx.coupon.fields.maxUses } }],
      },
      data: { usedCount: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new Error("Código sin usos disponibles");
    }
  });
}
