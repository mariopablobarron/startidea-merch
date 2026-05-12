import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    title: z.string().max(200).nullable().optional(),
    copy: z.string().min(1).max(10_000).optional(),
    hashtags: z.array(z.string().min(1).max(40)).max(15).optional(),
    mentions: z.array(z.string().min(1).max(60)).max(10).optional(),
    creativeUrl: z.string().url().max(500).nullable().optional(),
    creativeBrief: z.string().max(2000).nullable().optional(),
    productSlug: z.string().max(160).nullable().optional(),
    campaignId: z.string().nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    status: z
      .enum(["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "ARCHIVED"])
      .optional(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const piece = await prisma.contentPiece.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true, utmCampaign: true } },
      metrics: { orderBy: { day: "desc" }, take: 30 },
    },
  });
  if (!piece) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, piece });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.contentPiece.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Bloqueamos edición si ya está publicada (no quemar histórico)
  if (existing.status === "PUBLISHED") {
    return NextResponse.json(
      { error: "No se puede editar una pieza ya publicada. Crea una nueva." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const updated = await prisma.contentPiece.update({
    where: { id },
    data: {
      ...d,
      scheduledAt:
        d.scheduledAt !== undefined ? (d.scheduledAt ? new Date(d.scheduledAt) : null) : undefined,
    },
  });
  return NextResponse.json({ ok: true, piece: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.contentPiece.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
