import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import type { QuoteStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS: QuoteStatus[] = ["NEW", "IN_PROGRESS", "SENT", "WON", "LOST", "ARCHIVED"];

export async function GET(req: Request) {
  // Acepta sesión cookie O header X-Admin-Secret (para curl/scripts)
  const sessionOk = await isAdmin();
  if (!sessionOk) {
    const auth = requireAdminSecret(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  const where = statusParam && VALID_STATUS.includes(statusParam as QuoteStatus)
    ? { status: statusParam as QuoteStatus }
    : {};

  const [items, counts] = await Promise.all([
    prisma.quoteRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        notes: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { notes: true } },
      },
    }),
    prisma.quoteRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const summary = Object.fromEntries(VALID_STATUS.map((s) => [s, 0])) as Record<QuoteStatus, number>;
  for (const c of counts) summary[c.status] = c._count._all;

  return NextResponse.json({
    items,
    summary,
    total: Object.values(summary).reduce((a, b) => a + b, 0),
  });
}
