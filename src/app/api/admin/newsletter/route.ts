import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/newsletter
 *   ?q=search (en email/name/company)
 *   ?tag=lista-X (filtrar por tag exacto)
 *   ?status=subscribed|unsubscribed|all
 *   ?page=1&perPage=50
 *
 * Lista subscribers + stats globales (total, subscribed, unsubscribed, por tag).
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const tag = (url.searchParams.get("tag") || "").trim();
  const status = url.searchParams.get("status") || "subscribed";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(200, parseInt(url.searchParams.get("perPage") || "50", 10) || 50);

  const where: Record<string, unknown> = {};
  if (status === "subscribed") where.unsubscribedAt = null;
  else if (status === "unsubscribed") where.unsubscribedAt = { not: null };

  if (tag) where.tags = { has: tag };

  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  const sort = url.searchParams.get("sort") || "";
  const orderBy =
    sort === "engagement"
      ? [{ engagementScore: "desc" as const }, { lastOpenedAt: "desc" as const }]
      : { optedInAt: "desc" as const };

  const [items, total, statsSubscribed, statsUnsubscribed, tagsRaw] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        email: true,
        name: true,
        company: true,
        phone: true,
        tags: true,
        source: true,
        optedInAt: true,
        unsubscribedAt: true,
        lastSentAt: true,
        totalSent: true,
        engagementScore: true,
        lastOpenedAt: true,
        importBatchId: true,
      },
    }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: { not: null } } }),
    prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
      SELECT unnest("tags") AS tag, COUNT(*) AS count
      FROM "NewsletterSubscriber"
      WHERE "unsubscribedAt" IS NULL
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 30
    `,
  ]);

  const tags = tagsRaw.map((t) => ({ tag: t.tag, count: Number(t.count) }));

  return NextResponse.json({
    ok: true,
    items,
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    stats: { subscribed: statsSubscribed, unsubscribed: statsUnsubscribed, tags },
  });
}
