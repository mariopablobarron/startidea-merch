import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    subject: z.string().min(1).max(200).optional(),
    preheader: z.string().max(200).nullable().optional(),
    html: z.string().min(1).max(200_000).optional(),
    text: z.string().max(200_000).nullable().optional(),
    audience: z
      .enum(["NEWSLETTER_ALL", "NEWSLETTER_NEW", "CUSTOMERS_ALL", "CART_QUOTES_RECENT"])
      .optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    status: z.enum(["DRAFT", "SCHEDULED", "CANCELED"]).optional(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const b = await prisma.emailBroadcast.findUnique({ where: { id } });
  if (!b) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, broadcast: b });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.emailBroadcast.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (existing.status === "SENDING" || existing.status === "SENT") {
    return NextResponse.json(
      { error: `No se puede editar broadcast en estado ${existing.status}` },
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
  const updated = await prisma.emailBroadcast.update({
    where: { id },
    data: {
      ...d,
      scheduledAt:
        d.scheduledAt !== undefined ? (d.scheduledAt ? new Date(d.scheduledAt) : null) : undefined,
    },
  });
  return NextResponse.json({ ok: true, broadcast: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.emailBroadcast.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
