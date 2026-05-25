import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  code: z.string().min(2).max(40).transform((s) => s.trim().toUpperCase()),
  label: z.string().min(2).max(120),
  kind: z.enum(["PERCENT", "FIXED"]),
  percentValue: z.number().int().min(1).max(100).optional(),
  fixedCents: z.number().int().positive().max(100_000_000).optional(),
  minTotalCents: z.number().int().positive().max(100_000_000).optional(),
  maxUses: z.number().int().positive().max(100_000).optional(),
  validUntil: z.string().datetime().optional(),
  // Vínculo con afiliado: si se rellena, al canjear el cupón se generarán
  // entries COMMISSION + CREDIT automáticamente en el ledger.
  affiliateId: z.string().min(1).max(40).nullable().optional(),
  commissionPctOverride: z.number().int().min(0).max(50).nullable().optional(),
  creditPctOverride: z.number().int().min(0).max(50).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { redemptions: true } },
      affiliate: { select: { id: true, name: true, slug: true } },
    },
  });
  // También devolver lista de afiliados activos para el selector del form
  const affiliates = await prisma.affiliatePartner.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, commissionPct: true, creditPct: true },
  });
  return NextResponse.json({ ok: true, coupons, affiliates });
}

export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  if (d.kind === "PERCENT" && !d.percentValue) {
    return NextResponse.json({ error: "percentValue requerido para PERCENT" }, { status: 400 });
  }
  if (d.kind === "FIXED" && !d.fixedCents) {
    return NextResponse.json({ error: "fixedCents requerido para FIXED" }, { status: 400 });
  }

  try {
    const coupon = await prisma.coupon.create({
      data: {
        code: d.code,
        label: d.label,
        kind: d.kind,
        percentValue: d.percentValue,
        fixedCents: d.fixedCents,
        minTotalCents: d.minTotalCents,
        maxUses: d.maxUses,
        validUntil: d.validUntil ? new Date(d.validUntil) : null,
        notes: d.notes,
        affiliateId: d.affiliateId ?? null,
        commissionPctOverride: d.commissionPctOverride ?? null,
        creditPctOverride: d.creditPctOverride ?? null,
      },
    });
    return NextResponse.json({ ok: true, coupon });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Ya existe un cupón con ese código" }, { status: 409 });
    }
    throw err;
  }
}

const PatchSchema = z.object({
  id: z.string(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { id, ...data } = parsed.data;
  await prisma.coupon.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
