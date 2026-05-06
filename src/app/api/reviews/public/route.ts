import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reviews aprobadas y públicas para mostrar en la home y página /sobre.
 * Cache 10 min.
 */
export async function GET() {
  const reviews = await prisma.review.findMany({
    where: {
      approved: true,
      isPublic: true,
      submittedAt: { not: null },
      npsScore: { not: null },
    },
    orderBy: { submittedAt: "desc" },
    take: 12,
    select: {
      authorName: true,
      authorCompany: true,
      npsScore: true,
      comment: true,
      submittedAt: true,
    },
  });

  // NPS aggregate
  const all = await prisma.review.findMany({
    where: { approved: true, npsScore: { not: null } },
    select: { npsScore: true },
  });
  const promoters = all.filter((r) => (r.npsScore ?? 0) >= 9).length;
  const detractors = all.filter((r) => (r.npsScore ?? 0) <= 6).length;
  const total = all.length;
  const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;

  return NextResponse.json(
    {
      ok: true,
      reviews: reviews.map((r) => ({
        author: r.authorName,
        company: r.authorCompany,
        score: r.npsScore,
        comment: r.comment,
        at: r.submittedAt,
      })),
      stats: { total, promoters, detractors, npsScore },
    },
    { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" } },
  );
}
