import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Analytics agregadas para /admin/analytics.
 * Une AnalyticsEvent (eventos cliente) con CartQuote/Payment (eventos server)
 * para construir el funnel completo y los rankings.
 */

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(180, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalEvents,
    eventsByType,
    sessionsThisMonth,
    pageviewsByPath,
    topProductViews,
    addsToCart,
    payClicks,
    cartCount,
    paymentCount,
    paymentSum,
    cartCreatedSince,
    productCountActive,
    eventsByDay,
  ] = await Promise.all([
    prisma.analyticsEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.analyticsEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
    }),
    prisma.analyticsEvent
      .findMany({
        where: { createdAt: { gte: since }, sessionId: { not: null } },
        distinct: ["sessionId"],
        select: { sessionId: true },
      })
      .then((arr) => arr.length),
    prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: { type: "pageview", createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 12,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["productSlug"],
      where: { type: "pageview", createdAt: { gte: since }, productSlug: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productSlug: "desc" } },
      take: 10,
    }),
    prisma.analyticsEvent.count({
      where: { type: "addToCart", createdAt: { gte: since } },
    }),
    prisma.analyticsEvent.count({
      where: { type: "payClick", createdAt: { gte: since } },
    }),
    prisma.cartQuote.count({ where: { createdAt: { gte: since } } }),
    prisma.payment.count({ where: { status: "PAID", paidAt: { gte: since } } }),
    prisma.payment.aggregate({
      where: { status: "PAID", paidAt: { gte: since } },
      _sum: { amountCents: true },
    }),
    prisma.cartQuote.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        name: true,
        company: true,
        status: true,
        estimatedTotalCents: true,
      },
    }),
    prisma.product.count({ where: { active: true } }),
    // Pageviews por día (raw SQL agrupado)
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day,
             COUNT(*) as count
      FROM "AnalyticsEvent"
      WHERE "type" = 'pageview' AND "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `.catch(() => [] as Array<{ day: string; count: bigint }>),
  ]);

  // Enriquecer top products con nombre real
  const topProducts = await Promise.all(
    topProductViews
      .filter((t) => t.productSlug)
      .map(async (t) => {
        const product = await prisma.product.findUnique({
          where: { slug: t.productSlug! },
          select: { name: true, supplierRef: true },
        });
        return {
          slug: t.productSlug!,
          name: product?.name ?? t.productSlug!,
          ref: product?.supplierRef ?? "",
          views: t._count._all,
        };
      }),
  );

  const totalPageviews =
    eventsByType.find((e) => e.type === "pageview")?._count._all ?? 0;

  return NextResponse.json({
    ok: true,
    range: { days, since: since.toISOString() },
    summary: {
      totalEvents,
      totalPageviews,
      uniqueSessions: sessionsThisMonth,
      addsToCart,
      payClicks,
      cartCount,
      paymentCount,
      paidCents: paymentSum._sum.amountCents || 0,
      productCountActive,
    },
    funnel: {
      pageviews: totalPageviews,
      addToCart: addsToCart,
      cartQuote: cartCount,
      payClick: payClicks,
      paid: paymentCount,
    },
    eventsByType: eventsByType.map((e) => ({ type: e.type, count: e._count._all })),
    pageviewsByPath: pageviewsByPath.map((p) => ({ path: p.path ?? "—", count: p._count._all })),
    topProducts,
    eventsByDay: eventsByDay.map((d) => ({ day: d.day, count: Number(d.count) })),
    recentCarts: cartCreatedSince,
  });
}
