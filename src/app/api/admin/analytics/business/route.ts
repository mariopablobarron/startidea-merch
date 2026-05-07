import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Analytics de negocio (no de tráfico web — eso está en /api/admin/analytics).
 *
 * Devuelve KPIs ejecutivos para /admin/analytics/business:
 *  - Resumen general (carritos, pedidos, ingresos, ticket medio, conversión)
 *  - Revenue por mes (últimos 12)
 *  - Top productos por unidades y por ingresos
 *  - NPS por mes
 *  - Carritos abandonados: enviados, recuperados, recovery %
 *  - Broadcasts: enviados, fallidos, audiencia total
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "FACTURACION")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const now = new Date();
  const monthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalCarts,
    paidPayments,
    totalCustomers,
    cartsLast90,
    paidLast90,
    revenueByMonthRaw,
    topUnits,
    topRevenue,
    npsRaw,
    abandonedSent,
    abandonedRecovered,
    broadcastsSent30d,
    broadcastsFailed30d,
    activeProducts,
    abandonedNow,
    pendingDelivery,
  ] = await Promise.all([
    prisma.cartQuote.count(),
    prisma.payment.findMany({
      where: { status: "PAID", paidAt: { not: null } },
      select: { amountCents: true, paidAt: true },
    }),
    prisma.customerUser.count(),
    prisma.cartQuote.count({ where: { createdAt: { gte: ninetyDaysAgo } } }),
    prisma.payment.count({
      where: { status: "PAID", paidAt: { gte: ninetyDaysAgo } },
    }),
    prisma.$queryRaw<Array<{ month: string; revenue: bigint }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "paidAt"), 'YYYY-MM') AS month,
        SUM("amountCents")::BIGINT AS revenue
      FROM "Payment"
      WHERE "status" = 'PAID' AND "paidAt" >= ${monthsAgo}
      GROUP BY DATE_TRUNC('month', "paidAt")
      ORDER BY month ASC
    `,
    prisma.cartQuoteItem.groupBy({
      by: ["productSlug", "productName"],
      _sum: { quantity: true },
      where: { cart: { status: { in: ["CONFIRMED", "ORDERED", "ARCHIVED"] } } },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10,
    }),
    prisma.cartQuoteItem.groupBy({
      by: ["productSlug", "productName"],
      _sum: { totalClientCents: true, quantity: true },
      where: {
        cart: { status: { in: ["CONFIRMED", "ORDERED", "ARCHIVED"] } },
        totalClientCents: { not: null },
      },
      orderBy: { _sum: { totalClientCents: "desc" } },
      take: 10,
    }),
    prisma.$queryRaw<Array<{ month: string; avg: number; n: bigint }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
        AVG("score")::FLOAT AS avg,
        COUNT(*)::BIGINT AS n
      FROM "Review"
      WHERE "createdAt" >= ${monthsAgo}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `,
    prisma.cartQuote.count({
      where: { reminderSentAt: { not: null } },
    }),
    prisma.cartQuote.count({
      where: { recoveredAt: { not: null } },
    }),
    prisma.emailBroadcast.aggregate({
      where: { sentAt: { gte: last30 } },
      _sum: { sentCount: true, failedCount: true },
      _count: true,
    }),
    prisma.broadcastDelivery.count({
      where: { status: "FAILED", sentAt: { gte: last30 } },
    }),
    prisma.product.count({ where: { active: true } }),
    prisma.cartQuote.count({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        createdAt: { lt: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
        items: { some: {} },
      },
    }),
    prisma.cartQuote.count({
      where: { status: "ORDERED" },
    }),
  ]);

  // Procesar
  const totalRevenueCents = paidPayments.reduce((s, p) => s + p.amountCents, 0);
  const avgTicketCents = paidPayments.length > 0 ? Math.round(totalRevenueCents / paidPayments.length) : 0;
  const conversion = cartsLast90 > 0 ? (paidLast90 / cartsLast90) * 100 : 0;

  // Rellenar 12 meses (incluso si no hay revenue ese mes → 0)
  const revenueByMonth = fillMonthsBackfill(monthsAgo, now, revenueByMonthRaw, "revenue");
  const npsByMonth = fillMonthsBackfill(
    monthsAgo,
    now,
    npsRaw.map((r) => ({ month: r.month, value: r.avg, n: Number(r.n) })),
    "value",
  );

  return NextResponse.json({
    ok: true,
    generatedAt: now.toISOString(),
    summary: {
      totalCarts,
      totalPayments: paidPayments.length,
      totalCustomers,
      activeProducts,
      pendingOrders: pendingDelivery,
      abandonedNow,
      revenueCents: totalRevenueCents,
      avgTicketCents,
      conversionPctLast90: Number(conversion.toFixed(1)),
    },
    revenueByMonth,
    topProducts: {
      byUnits: topUnits.map((p) => ({
        slug: p.productSlug,
        name: p.productName,
        units: p._sum.quantity || 0,
      })),
      byRevenue: topRevenue.map((p) => ({
        slug: p.productSlug,
        name: p.productName,
        revenueCents: p._sum.totalClientCents || 0,
        units: p._sum.quantity || 0,
      })),
    },
    nps: {
      monthly: npsByMonth,
      avgOverall:
        npsRaw.length > 0
          ? Number(
              (npsRaw.reduce((s, r) => s + r.avg * Number(r.n), 0) /
                npsRaw.reduce((s, r) => s + Number(r.n), 0)).toFixed(2),
            )
          : null,
      totalReviews: npsRaw.reduce((s, r) => s + Number(r.n), 0),
    },
    abandonedCart: {
      remindersSent: abandonedSent,
      recovered: abandonedRecovered,
      recoveryRatePct:
        abandonedSent > 0 ? Number(((abandonedRecovered / abandonedSent) * 100).toFixed(1)) : 0,
    },
    broadcasts: {
      last30Days: {
        broadcasts: broadcastsSent30d._count,
        sent: broadcastsSent30d._sum.sentCount || 0,
        failed: broadcastsFailed30d,
      },
    },
  });
}

function fillMonthsBackfill<T extends { month: string }>(
  from: Date,
  to: Date,
  rows: T[],
  valueKey: keyof T,
): Array<{ month: string; value: number; raw?: T }> {
  const map = new Map<string, T>(rows.map((r) => [r.month, r]));
  const result: Array<{ month: string; value: number; raw?: T }> = [];
  const cur = new Date(from);
  while (cur <= to) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    const row = map.get(key);
    let value = 0;
    if (row) {
      const raw = row[valueKey];
      if (typeof raw === "bigint") value = Number(raw);
      else if (typeof raw === "number") value = raw;
    }
    result.push({ month: key, value, raw: row });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}
