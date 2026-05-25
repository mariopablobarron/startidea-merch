import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getAffiliateBalance } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    email: z.string().email().max(180).optional(),
    company: z.string().max(180).nullable().optional(),
    commissionPct: z.number().int().min(0).max(50).optional(),
    creditPct: z.number().int().min(0).max(50).optional(),
    active: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const partner = await prisma.affiliatePartner.findUnique({
    where: { id },
    include: {
      coupons: { select: { id: true, code: true, label: true, active: true, usedCount: true } },
      _count: { select: { referrals: true } },
    },
  });
  if (!partner) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const balance = await getAffiliateBalance(id);
  const ledger = await prisma.affiliateLedgerEntry.findMany({
    where: { partnerId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ ok: true, partner, balance, ledger });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.email !== undefined) data.email = d.email.toLowerCase();
  if (d.company !== undefined) data.company = d.company;
  if (d.commissionPct !== undefined) data.commissionPct = d.commissionPct;
  if (d.creditPct !== undefined) data.creditPct = d.creditPct;
  if (d.active !== undefined) data.active = d.active;
  if (d.notes !== undefined) data.notes = d.notes;
  try {
    const partner = await prisma.affiliatePartner.update({ where: { id }, data });
    return NextResponse.json({ ok: true, partner });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
