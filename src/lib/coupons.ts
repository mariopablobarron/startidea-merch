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
 * RESERVA un uso del cupón de forma atómica. Devuelve `true` sólo si el uso
 * quedó reservado de verdad.
 *
 * Es un único `UPDATE ... WHERE usedCount < maxUses` en el motor de BD, así que
 * dos peticiones concurrentes sobre el último uso disponible no pueden ganar
 * las dos: la perdedora recibe `count = 0`.
 *
 * ⚠️ ORDEN OBLIGATORIO (2026-08-04): hay que reservar ANTES de restar el
 * descuento del importe que se persiste. Hasta ahora el uso se reclamaba
 * DESPUÉS de haber creado el CartQuote con `acceptedTotalCents` ya rebajado y
 * su link de pago emitido, de modo que la perdedora de la carrera se quedaba
 * igualmente con un carrito descontado y cobrable por Stripe: el cerrojo era
 * atómico pero llegaba tarde. Con un cupón FIXED de −500 € y `maxUses: 1`, dos
 * peticiones simultáneas cobraban 500 € de descuento cada una mientras
 * `usedCount` marcaba 1 y el panel de admin no delataba nada.
 */
export async function claimCouponUse(couponId: string): Promise<boolean> {
  const claimed = await prisma.coupon.updateMany({
    where: {
      id: couponId,
      OR: [{ maxUses: null }, { usedCount: { lt: prisma.coupon.fields.maxUses } }],
    },
    data: { usedCount: { increment: 1 } },
  });
  return claimed.count === 1;
}

/**
 * Devuelve un uso reservado con `claimCouponUse` cuando la operación que lo
 * motivó no llegó a completarse (p. ej. el CartQuote no se pudo crear). Sin
 * esto, un fallo posterior quemaría el uso de un cupón que nadie disfrutó.
 *
 * El guard `usedCount > 0` evita dejar el contador en negativo si se llama dos
 * veces.
 */
export async function releaseCouponUse(couponId: string): Promise<void> {
  await prisma.coupon.updateMany({
    where: { id: couponId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}

/**
 * Registra la redención de un cupón YA reservado con `claimCouponUse`.
 *
 * NO incrementa `usedCount` — el uso se consumió al reservar. Esta función es
 * sólo la contabilidad de qué carrito gastó qué cupón. Si el carrito ya tenía
 * uno, se devuelve el uso del anterior y se sustituye.
 */
export async function recordCouponRedemption(
  cartId: string,
  couponId: string,
  discountCents: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const previous = await tx.couponRedemption.findUnique({ where: { cartId } });
    if (previous) {
      await tx.coupon.updateMany({
        where: { id: previous.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
      await tx.couponRedemption.delete({ where: { cartId } });
    }
    await tx.couponRedemption.create({
      data: { cartId, couponId, discountCents },
    });
  });
}
