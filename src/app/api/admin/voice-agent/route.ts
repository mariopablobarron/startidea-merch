import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const [sessions, agg] = await Promise.all([
    prisma.voiceSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
      include: {
        resultingCart: { select: { id: true, name: true, email: true, estimatedTotalCents: true, status: true } },
      },
    }),
    prisma.voiceSession.aggregate({
      _count: { _all: true },
      _sum: { durationSec: true, estimatedCostCents: true },
    }),
  ]);

  const convertedCount = sessions.filter((s) => s.resultingCartId).length;

  return NextResponse.json({
    sessions,
    summary: {
      totalSessions: agg._count._all,
      totalDurationSec: agg._sum.durationSec || 0,
      totalCostCents: agg._sum.estimatedCostCents || 0,
      conversionsLast100: convertedCount,
      conversionRateLast100: sessions.length > 0 ? Math.round((convertedCount / sessions.length) * 100) : 0,
    },
  });
}
