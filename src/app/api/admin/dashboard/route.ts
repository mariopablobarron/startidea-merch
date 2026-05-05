import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dashboard agregado para /admin. Una sola llamada, todos los KPIs.
 *
 * Métricas:
 *   - Cotizaciones por estado (mes actual + 30/90 días)
 *   - Total aceptado, total cotizado, total cobrado (Stripe PAID)
 *   - Conversión: % de cotizaciones que llegan a pago confirmado
 *   - Top productos cotizados (count + revenue estimate)
 *   - Embudo: NEW → IN_PROGRESS → SENT → CONFIRMED → ORDERED
 *   - Cotizaciones lentas: status NEW > 24h
 *   - Quote requests del formulario simple (no carrito)
 */
export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const stale24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalCarts,
    cartsThisMonth,
    cartsLast30,
    cartsLast90,
    cartsByStatus,
    cartsAgg,
    paidPayments,
    paidThisMonth,
    quoteRequestsThisMonth,
    staleCarts,
    recentCarts,
    topItems,
    productsCount,
  ] = await Promise.all([
    prisma.cartQuote.count(),
    prisma.cartQuote.count({ where: { createdAt: { gte: startMonth } } }),
    prisma.cartQuote.count({ where: { createdAt: { gte: last30 } } }),
    prisma.cartQuote.count({ where: { createdAt: { gte: last90 } } }),
    prisma.cartQuote.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { estimatedTotalCents: true, acceptedTotalCents: true },
    }),
    prisma.cartQuote.aggregate({
      _sum: { estimatedTotalCents: true, acceptedTotalCents: true },
      where: { createdAt: { gte: last90 } },
    }),
    prisma.payment.aggregate({
      where: { status: "PAID" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { status: "PAID", paidAt: { gte: startMonth } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.quoteRequest.count({ where: { createdAt: { gte: startMonth } } }),
    prisma.cartQuote.findMany({
      where: { status: { in: ["NEW", "IN_PROGRESS"] }, createdAt: { lt: stale24h } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        status: true,
        createdAt: true,
        estimatedTotalCents: true,
      },
    }),
    prisma.cartQuote.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        status: true,
        createdAt: true,
        estimatedTotalCents: true,
        acceptedTotalCents: true,
      },
    }),
    prisma.cartQuoteItem.groupBy({
      by: ["productSlug", "productName"],
      _count: { _all: true },
      _sum: { quantity: true, totalClientCents: true },
      orderBy: { _count: { productSlug: "desc" } },
      take: 8,
    }),
    prisma.product.count({ where: { active: true } }),
  ]);

  const statusMap: Record<string, { count: number; estimated: number; accepted: number }> = {};
  for (const s of cartsByStatus) {
    statusMap[s.status] = {
      count: s._count._all,
      estimated: s._sum.estimatedTotalCents || 0,
      accepted: s._sum.acceptedTotalCents || 0,
    };
  }

  const totalConfirmed =
    (statusMap.CONFIRMED?.count || 0) + (statusMap.ORDERED?.count || 0);
  const conversionPct = totalCarts > 0 ? Math.round((totalConfirmed / totalCarts) * 1000) / 10 : 0;

  return NextResponse.json({
    ok: true,
    generatedAt: now.toISOString(),
    counts: {
      carts: {
        total: totalCarts,
        thisMonth: cartsThisMonth,
        last30: cartsLast30,
        last90: cartsLast90,
      },
      products: productsCount,
      payments: {
        total: paidPayments._count._all,
        thisMonth: paidThisMonth._count._all,
      },
      quoteRequests: { thisMonth: quoteRequestsThisMonth },
    },
    revenueCents: {
      paidTotal: paidPayments._sum.amountCents || 0,
      paidThisMonth: paidThisMonth._sum.amountCents || 0,
      acceptedLast90: cartsAgg._sum.acceptedTotalCents || 0,
      estimatedLast90: cartsAgg._sum.estimatedTotalCents || 0,
    },
    funnel: {
      NEW: statusMap.NEW || { count: 0, estimated: 0, accepted: 0 },
      IN_PROGRESS: statusMap.IN_PROGRESS || { count: 0, estimated: 0, accepted: 0 },
      SENT: statusMap.SENT || { count: 0, estimated: 0, accepted: 0 },
      CONFIRMED: statusMap.CONFIRMED || { count: 0, estimated: 0, accepted: 0 },
      ORDERED: statusMap.ORDERED || { count: 0, estimated: 0, accepted: 0 },
      ARCHIVED: statusMap.ARCHIVED || { count: 0, estimated: 0, accepted: 0 },
    },
    conversionPct,
    staleCarts,
    recentCarts,
    topItems: topItems.map((t) => ({
      productSlug: t.productSlug,
      productName: t.productName,
      timesQuoted: t._count._all,
      unitsQuoted: t._sum.quantity || 0,
      revenueCents: t._sum.totalClientCents || 0,
    })),
  });
}
