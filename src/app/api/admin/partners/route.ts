import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  slug: z.string().min(2).max(60).transform((s) => s.trim().toLowerCase()),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  company: z.string().max(160).optional(),
  commissionPct: z.number().int().min(1).max(50).default(10),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const partners = await prisma.affiliatePartner.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { referrals: true } } },
  });
  return NextResponse.json({ ok: true, partners });
}

export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    const partner = await prisma.affiliatePartner.create({ data: parsed.data });
    return NextResponse.json({ ok: true, partner });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Slug ya en uso" }, { status: 409 });
    }
    throw err;
  }
}

const PatchSchema = z.object({
  id: z.string(),
  active: z.boolean().optional(),
  commissionPct: z.number().int().min(1).max(50).optional(),
});

export async function PATCH(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { id, ...data } = parsed.data;
  await prisma.affiliatePartner.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
