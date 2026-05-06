import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "merch:ref";
const COOKIE_MAX_AGE_DAYS = 30;

/**
 * Lee slug del partner desde el querystring (?ref=slug) o desde la cookie.
 * Para uso desde Server Components / Route Handlers (req con cookies).
 */
export function readPartnerSlug(req: Request): string | null {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  if (ref) return ref.trim().toLowerCase();
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`${COOKIE_NAME.replace(/:/g, "%3A")}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setPartnerCookieHeaders(slug: string): Record<string, string> {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  return {
    "Set-Cookie": `${COOKIE_NAME}=${encodeURIComponent(slug)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`,
  };
}

/**
 * Asocia un CartQuote con un Partner (si el slug existe y está activo) y
 * crea Referral LEAD. Idempotente: si ya hay Referral para ese cart, no hace.
 */
export async function attachReferral(cartId: string, partnerSlug: string): Promise<void> {
  const partner = await prisma.affiliatePartner.findUnique({ where: { slug: partnerSlug.toLowerCase() } });
  if (!partner || !partner.active) return;

  await prisma.referral.upsert({
    where: { cartId },
    create: {
      cartId,
      partnerId: partner.id,
      status: "LEAD",
    },
    update: {}, // no machacar si ya existe
  });
}

/**
 * Convierte Referral LEAD a EARNED al recibir pago.
 * Calcula commission = amountCents * partner.commissionPct / 100.
 */
export async function markReferralEarned(cartId: string, paidCents: number): Promise<void> {
  const referral = await prisma.referral.findUnique({
    where: { cartId },
    include: { partner: true },
  });
  if (!referral || referral.status !== "LEAD") return;

  const commission = Math.round((paidCents * referral.partner.commissionPct) / 100);
  await prisma.$transaction([
    prisma.referral.update({
      where: { id: referral.id },
      data: { status: "EARNED", baseAmountCents: paidCents, commissionCents: commission },
    }),
    prisma.affiliatePartner.update({
      where: { id: referral.partnerId },
      data: { totalEarnedCents: { increment: commission } },
    }),
  ]);
}
