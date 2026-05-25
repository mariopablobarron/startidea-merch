/**
 * Helpers de afiliados — saldos + cálculo COMMISSION/CREDIT al canjear cupón.
 *
 * NO se engancha al checkout en esta fase (F1 admin readonly).
 * En F2, el endpoint de "pago confirmado del cart" llamará a
 * `recordCouponRedemption()` para crear las entries del ledger.
 */
import { prisma } from "@/lib/prisma";
import type { AffiliateLedgerKind } from "@prisma/client";

export type AffiliateBalance = {
  partnerId: string;
  commissionEarned: number;   // SUM(COMMISSION + ADJUSTMENT positivos relevantes)
  commissionPaid: number;     // SUM(|PAYOUT|)
  commissionPending: number;  // earned - paid
  creditEarned: number;       // SUM(CREDIT)
  creditUsed: number;         // SUM(|CREDIT_USED|)
  creditAvailable: number;    // earned - used
};

/**
 * Calcula los saldos actuales de un afiliado a partir del ledger.
 * Hace SUM agrupado por kind — el ledger es append-only, no se reconstruye.
 */
export async function getAffiliateBalance(partnerId: string): Promise<AffiliateBalance> {
  const rows = await prisma.affiliateLedgerEntry.groupBy({
    by: ["kind"],
    where: { partnerId },
    _sum: { amountCents: true },
  });
  const byKind = new Map<AffiliateLedgerKind, number>();
  for (const r of rows) byKind.set(r.kind, r._sum.amountCents || 0);

  const commissionEarned = byKind.get("COMMISSION") || 0;
  const commissionPaid = Math.abs(byKind.get("PAYOUT") || 0);
  const creditEarned = byKind.get("CREDIT") || 0;
  const creditUsed = Math.abs(byKind.get("CREDIT_USED") || 0);
  // ADJUSTMENT puede ir a uno u otro side según note del admin — por defecto
  // lo contamos como commission (interpretación más común: bonus/corrección de
  // comisión). Si se necesita más granularidad, añadir kind ADJUSTMENT_CREDIT.
  const adjustment = byKind.get("ADJUSTMENT") || 0;

  return {
    partnerId,
    commissionEarned: commissionEarned + Math.max(0, adjustment),
    commissionPaid,
    commissionPending: commissionEarned + adjustment - commissionPaid,
    creditEarned,
    creditUsed,
    creditAvailable: creditEarned - creditUsed,
  };
}

/**
 * Calcula los saldos de TODOS los partners en 1 query (para la lista admin).
 */
export async function getAllAffiliateBalances(): Promise<Map<string, AffiliateBalance>> {
  const rows = await prisma.affiliateLedgerEntry.groupBy({
    by: ["partnerId", "kind"],
    _sum: { amountCents: true },
  });
  const byPartner = new Map<string, Map<AffiliateLedgerKind, number>>();
  for (const r of rows) {
    if (!byPartner.has(r.partnerId)) byPartner.set(r.partnerId, new Map());
    byPartner.get(r.partnerId)!.set(r.kind, r._sum.amountCents || 0);
  }
  const out = new Map<string, AffiliateBalance>();
  for (const [partnerId, byKind] of byPartner) {
    const commissionEarned = byKind.get("COMMISSION") || 0;
    const commissionPaid = Math.abs(byKind.get("PAYOUT") || 0);
    const creditEarned = byKind.get("CREDIT") || 0;
    const creditUsed = Math.abs(byKind.get("CREDIT_USED") || 0);
    const adjustment = byKind.get("ADJUSTMENT") || 0;
    out.set(partnerId, {
      partnerId,
      commissionEarned: commissionEarned + Math.max(0, adjustment),
      commissionPaid,
      commissionPending: commissionEarned + adjustment - commissionPaid,
      creditEarned,
      creditUsed,
      creditAvailable: creditEarned - creditUsed,
    });
  }
  return out;
}

/**
 * Llamar cuando se confirma el pago de un cart que tenía un cupón con afiliado.
 * Crea las 2 entries (COMMISSION + CREDIT) en el ledger en una transacción.
 *
 * - `cartTotalCents`: el total YA pagado por el cliente (post-cupón). Sobre
 *   ese total se calculan los %. (Decisión: las comisiones se devengan sobre
 *   lo que realmente cobra el negocio, no sobre el bruto pre-descuento).
 * - Devuelve las dos entries creadas o `null` si el cupón no tiene afiliado.
 *
 * IDEMPOTENTE por (cartId, kind): si ya existe entry para este cart+kind,
 * no duplica. Evita doble-cobro si el webhook Stripe se dispara 2 veces.
 */
export async function recordCouponRedemption(opts: {
  cartId: string;
  couponId: string;
  cartTotalCents: number;
}) {
  const coupon = await prisma.coupon.findUnique({
    where: { id: opts.couponId },
    include: { affiliate: true },
  });
  if (!coupon || !coupon.affiliate || !coupon.affiliate.active) return null;

  const partner = coupon.affiliate;
  const commissionPct = coupon.commissionPctOverride ?? partner.commissionPct;
  const creditPct = coupon.creditPctOverride ?? partner.creditPct;

  const commissionCents = Math.round((opts.cartTotalCents * commissionPct) / 100);
  const creditCents = Math.round((opts.cartTotalCents * creditPct) / 100);

  // Idempotencia: dedupe por (cartId, kind) — si ya hay entries de este cart,
  // asumimos que el webhook ya procesó este pago.
  const existing = await prisma.affiliateLedgerEntry.findMany({
    where: { cartId: opts.cartId, kind: { in: ["COMMISSION", "CREDIT"] } },
    select: { id: true },
  });
  if (existing.length > 0) return null;

  const entries = await prisma.$transaction([
    ...(commissionCents > 0
      ? [
          prisma.affiliateLedgerEntry.create({
            data: {
              partnerId: partner.id,
              kind: "COMMISSION",
              amountCents: commissionCents,
              cartId: opts.cartId,
              couponId: coupon.id,
              createdBy: "system",
              note: `Cupón ${coupon.code} · ${commissionPct}% sobre ${(opts.cartTotalCents / 100).toFixed(2)}€`,
            },
          }),
        ]
      : []),
    ...(creditCents > 0
      ? [
          prisma.affiliateLedgerEntry.create({
            data: {
              partnerId: partner.id,
              kind: "CREDIT",
              amountCents: creditCents,
              cartId: opts.cartId,
              couponId: coupon.id,
              createdBy: "system",
              note: `Cupón ${coupon.code} · ${creditPct}% crédito sobre ${(opts.cartTotalCents / 100).toFixed(2)}€`,
            },
          }),
        ]
      : []),
  ]);

  return { commissionCents, creditCents, entries };
}
