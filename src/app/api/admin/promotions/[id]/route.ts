import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/admin/promotions/[id]
 *   PUT    actualiza (CEO o COMERCIAL)
 *   DELETE elimina (solo CEO)
 */

const PatchSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    value: z.number().int().positive().max(100_000_000).optional(),
    targetIds: z.array(z.string().min(1)).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    active: z.boolean().optional(),
    badgeText: z.string().max(40).nullable().optional(),
    badgeColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Hex tipo #E63E73")
      .nullable()
      .optional(),
    displayInList: z.boolean().optional(),
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
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.description !== undefined) data.description = d.description;
  if (d.value !== undefined) data.value = d.value;
  if (d.targetIds !== undefined) data.targetIds = d.targetIds;
  if (d.startsAt !== undefined) data.startsAt = new Date(d.startsAt);
  if (d.endsAt !== undefined) data.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  if (d.active !== undefined) data.active = d.active;
  if (d.badgeText !== undefined) data.badgeText = d.badgeText;
  if (d.badgeColor !== undefined) data.badgeColor = d.badgeColor;
  if (d.displayInList !== undefined) data.displayInList = d.displayInList;

  try {
    const promo = await prisma.promotion.update({ where: { id }, data });
    return NextResponse.json({ ok: true, promotion: promo });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Record to update not found")) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar promociones" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.promotion.delete({ where: { id } }).catch((e) =>
    console.error("[admin-promotions] delete falló:", e instanceof Error ? e.message : e),
  );
  return NextResponse.json({ ok: true });
}
