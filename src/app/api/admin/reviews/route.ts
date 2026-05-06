import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const reviews = await prisma.review.findMany({
    orderBy: [{ submittedAt: "desc" }, { invitedAt: "desc" }],
    take: 100,
    include: {
      cart: { select: { name: true, company: true, email: true, status: true } },
    },
  });

  // NPS aggregate
  const all = await prisma.review.findMany({
    where: { npsScore: { not: null } },
    select: { npsScore: true },
  });
  const promoters = all.filter((r) => (r.npsScore ?? 0) >= 9).length;
  const detractors = all.filter((r) => (r.npsScore ?? 0) <= 6).length;
  const total = all.length;
  const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;

  return NextResponse.json({
    ok: true,
    reviews,
    stats: { total, promoters, detractors, npsScore },
  });
}

const PatchSchema = z.object({
  id: z.string().min(1),
  approved: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { id, ...data } = parsed.data;
  await prisma.review.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
