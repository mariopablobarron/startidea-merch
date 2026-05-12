import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Atribución last-touch básica:
 *   - Revenue: agrupado por utm_source/medium/campaign de CartQuote
 *     filtrando solo carts con Payment.PAID
 *   - Spend: tabla MarketingSpend (input manual o API future)
 *   - ROAS: revenue / spend (si spend > 0)
 *   - CPA: spend / nº pedidos pagados
 *
 * Por defecto últimos 90 días. Configurable con ?days=N.
 *
 * Permisos: CEO + FACTURACION (es info financiera).
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "FACTURACION")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, parseInt(url.searchParams.get("days") || "90", 10));
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Pedidos pagados con su UTM (vía CartQuote)
  const payments = await prisma.payment.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: since, not: null },
    },
    select: {
      amountCents: true,
      paidAt: true,
      cart: { select: { utm: true, email: true } },
    },
  });

  type RevenueRow = {
    source: string;
    medium: string;
    campaign: string | null;
    revenueCents: number;
    paidCount: number;
    customers: Set<string>;
  };
  const revenueMap = new Map<string, RevenueRow>();

  for (const p of payments) {
    const utm = (p.cart.utm as Record<string, string> | null) || {};
    const source = (utm.utm_source || "direct").toLowerCase();
    const medium = (utm.utm_medium || "(none)").toLowerCase();
    const campaign = utm.utm_campaign || null;
    const key = `${source}|${medium}|${campaign || ""}`;
    const existing = revenueMap.get(key);
    if (existing) {
      existing.revenueCents += p.amountCents;
      existing.paidCount += 1;
      existing.customers.add(p.cart.email);
    } else {
      revenueMap.set(key, {
        source,
        medium,
        campaign,
        revenueCents: p.amountCents,
        paidCount: 1,
        customers: new Set([p.cart.email]),
      });
    }
  }

  // Spend del mismo periodo (alineamos al primer día del mes inicio)
  const monthStart = new Date(since.getFullYear(), since.getMonth(), 1);
  const spends = await prisma.marketingSpend.findMany({
    where: { month: { gte: monthStart } },
  });

  const spendMap = new Map<string, number>();
  for (const s of spends) {
    const key = `${s.source}|${s.medium}|${s.campaign || ""}`;
    spendMap.set(key, (spendMap.get(key) || 0) + s.spendCents);
  }

  // Combinar — incluir source/medium/campaign que tengan revenue O spend
  const allKeys = new Set([...revenueMap.keys(), ...spendMap.keys()]);
  const rows = Array.from(allKeys).map((key) => {
    const [source, medium, campaign] = key.split("|");
    const rev = revenueMap.get(key);
    const spendCents = spendMap.get(key) || 0;
    const revenueCents = rev?.revenueCents || 0;
    const paidCount = rev?.paidCount || 0;
    const uniqueCustomers = rev?.customers.size || 0;
    const roas = spendCents > 0 ? revenueCents / spendCents : null;
    const cpaCents = paidCount > 0 ? Math.round(spendCents / paidCount) : null;
    return {
      source,
      medium,
      campaign: campaign || null,
      revenueCents,
      spendCents,
      paidCount,
      uniqueCustomers,
      roas,
      cpaCents,
    };
  });

  // Sort por revenue desc
  rows.sort((a, b) => b.revenueCents - a.revenueCents);

  // Agregados globales
  const totalRevenue = rows.reduce((s, r) => s + r.revenueCents, 0);
  const totalSpend = rows.reduce((s, r) => s + r.spendCents, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidCount, 0);

  return NextResponse.json({
    ok: true,
    range: { days, since: since.toISOString() },
    totals: {
      revenueCents: totalRevenue,
      spendCents: totalSpend,
      paidCount: totalPaid,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : null,
      cpaCents: totalPaid > 0 ? Math.round(totalSpend / totalPaid) : null,
    },
    rows,
  });
}
