import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Formato YYYY-MM-01"),
  source: z.string().min(1).max(60),
  medium: z.string().min(1).max(60),
  campaign: z.string().max(120).nullable().optional(),
  spendCents: z.number().int().min(0).max(100_000_000),
  impressions: z.number().int().min(0).nullable().optional(),
  clicks: z.number().int().min(0).nullable().optional(),
  conversions: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "FACTURACION")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const url = new URL(req.url);
  const sinceMonths = parseInt(url.searchParams.get("sinceMonths") || "12", 10);
  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  since.setDate(1);

  const items = await prisma.marketingSpend.findMany({
    where: { month: { gte: since } },
    orderBy: [{ month: "desc" }, { source: "asc" }, { campaign: "asc" }],
  });

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "FACTURACION")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const spend = await prisma.marketingSpend.upsert({
    where: {
      month_source_medium_campaign: {
        month: new Date(d.month),
        source: d.source.toLowerCase(),
        medium: d.medium.toLowerCase(),
        campaign: d.campaign || null,
      } as never,
    },
    update: {
      spendCents: d.spendCents,
      impressions: d.impressions ?? null,
      clicks: d.clicks ?? null,
      conversions: d.conversions ?? null,
      notes: d.notes ?? null,
    },
    create: {
      month: new Date(d.month),
      source: d.source.toLowerCase(),
      medium: d.medium.toLowerCase(),
      campaign: d.campaign || null,
      spendCents: d.spendCents,
      impressions: d.impressions ?? null,
      clicks: d.clicks ?? null,
      conversions: d.conversions ?? null,
      notes: d.notes ?? null,
      origin: "manual",
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, spend });
}

export async function DELETE(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.marketingSpend.delete({ where: { id } }).catch((e) =>
    console.error("[admin-marketing-spend] delete falló:", e instanceof Error ? e.message : e),
  );
  return NextResponse.json({ ok: true });
}
