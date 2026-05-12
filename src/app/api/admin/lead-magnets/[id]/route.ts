import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    fileUrl: z.string().url().max(500).optional(),
    heroUrl: z.string().url().max(500).nullable().optional(),
    category: z.string().max(40).nullable().optional(),
    tags: z.array(z.string().min(1).max(40)).max(15).optional(),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const magnet = await prisma.leadMagnet.findUnique({
    where: { id },
    include: {
      downloads: { orderBy: { downloadedAt: "desc" }, take: 50 },
      _count: { select: { downloads: true } },
    },
  });
  if (!magnet) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, magnet });
}

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
  const magnet = await prisma.leadMagnet.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true, magnet });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  const { id } = await params;
  await prisma.leadMagnet.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
