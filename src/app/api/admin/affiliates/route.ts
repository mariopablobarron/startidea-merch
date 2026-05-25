import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getAllAffiliateBalances } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  company: z.string().max(180).nullable().optional(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones")
    .optional(),
  commissionPct: z.number().int().min(0).max(50).default(10),
  creditPct: z.number().int().min(0).max(50).default(0),
  notes: z.string().max(2000).nullable().optional(),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const partners = await prisma.affiliatePartner.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { coupons: true, referrals: true } },
    },
  });
  const balances = await getAllAffiliateBalances();

  return NextResponse.json({
    ok: true,
    partners: partners.map((p) => ({
      ...p,
      balance: balances.get(p.id) || {
        partnerId: p.id,
        commissionEarned: 0,
        commissionPaid: 0,
        commissionPending: 0,
        creditEarned: 0,
        creditUsed: 0,
        creditAvailable: 0,
      },
    })),
  });
}

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const slug = d.slug || slugify(d.name);
  try {
    const partner = await prisma.affiliatePartner.create({
      data: {
        slug,
        name: d.name,
        email: d.email.toLowerCase(),
        company: d.company ?? null,
        commissionPct: d.commissionPct,
        creditPct: d.creditPct,
        notes: d.notes ?? null,
      },
    });
    return NextResponse.json({ ok: true, partner });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Ya existe un partner con slug "${slug}"` },
        { status: 409 },
      );
    }
    throw err;
  }
}
