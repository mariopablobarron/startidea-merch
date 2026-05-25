import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/admin/newsletter/[email]    update subscriber
 * DELETE /api/admin/newsletter/[email]  borra (solo CEO)
 *
 * Acciones tipicas: editar tags (añadir/quitar lista), marcar unsubscribed,
 * actualizar name/company.
 */

const PatchSchema = z
  .object({
    name: z.string().max(120).nullable().optional(),
    company: z.string().max(180).nullable().optional(),
    phone: z.string().max(60).nullable().optional(),
    tags: z.array(z.string().max(60)).optional(),
    unsubscribed: z.boolean().optional(), // true → marca opt-out; false → reactiva
  })
  .strict();

export async function PUT(req: Request, { params }: { params: Promise<{ email: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase().trim();
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.company !== undefined) data.company = d.company;
  if (d.phone !== undefined) data.phone = d.phone;
  if (d.tags !== undefined) data.tags = Array.from(new Set(d.tags));
  if (d.unsubscribed === true) data.unsubscribedAt = new Date();
  if (d.unsubscribed === false) data.unsubscribedAt = null;

  try {
    const sub = await prisma.newsletterSubscriber.update({ where: { email }, data });
    return NextResponse.json({ ok: true, subscriber: sub });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ email: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar subscribers" }, { status: 403 });
  }
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase().trim();
  await prisma.newsletterSubscriber.delete({ where: { email } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
