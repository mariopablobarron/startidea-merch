import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS = [
  "HOME_TOP",
  "HOME_MID",
  "CATALOGO_TOP",
  "FICHA_PRODUCTO",
  "FOOTER",
] as const;

const PatchSchema = z
  .object({
    slot: z.enum(SLOTS).optional(),
    title: z.string().min(1).max(160).optional(),
    subtitle: z.string().max(500).nullable().optional(),
    ctaLabel: z.string().max(80).nullable().optional(),
    ctaUrl: z.string().max(500).nullable().optional(),
    imageUrl: z.string().url().max(500).nullable().optional(),
    bgColor: z
      .string()
      .regex(/^#?[0-9a-fA-F]{3,8}$/)
      .nullable()
      .optional(),
    textColor: z
      .string()
      .regex(/^#?[0-9a-fA-F]{3,8}$/)
      .nullable()
      .optional(),
    active: z.boolean().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const banner = await prisma.marketingBanner.findUnique({ where: { id } });
  if (!banner) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, banner });
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
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const updated = await prisma.marketingBanner.update({
    where: { id },
    data: {
      ...d,
      bgColor: d.bgColor !== undefined ? normalizeHex(d.bgColor) : undefined,
      textColor: d.textColor !== undefined ? normalizeHex(d.textColor) : undefined,
      startsAt: d.startsAt !== undefined ? (d.startsAt ? new Date(d.startsAt) : null) : undefined,
      endsAt: d.endsAt !== undefined ? (d.endsAt ? new Date(d.endsAt) : null) : undefined,
      updatedBy: session.email,
    },
  });
  return NextResponse.json({ ok: true, banner: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.marketingBanner.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

function normalizeHex(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  return t.startsWith("#") ? t : `#${t}`;
}
