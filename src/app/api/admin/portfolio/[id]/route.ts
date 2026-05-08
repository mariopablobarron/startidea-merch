import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    imageUrl: z.string().url().max(500).optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    clientName: z.string().max(120).nullable().optional(),
    productSlug: z.string().max(160).nullable().optional(),
    sector: z.string().max(40).nullable().optional(),
    featured: z.boolean().optional(),
    active: z.boolean().optional(),
    order: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const item = await prisma.portfolioItem.update({
    where: { id },
    data: { ...parsed.data, updatedBy: session.email },
  });
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  const { id } = await params;
  await prisma.portfolioItem.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
