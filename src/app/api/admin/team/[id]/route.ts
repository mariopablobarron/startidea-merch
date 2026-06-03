/**
 * PATCH  /api/admin/team/[id]   body: { role? | active? }
 *
 * Solo CEO. Guardas:
 *   - No puede modificarse a sí mismo (ni rol ni active)
 *   - No puede dejar el sistema sin CEO activo (último CEO no se
 *     puede desactivar ni degradar)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    role: z.enum(["CEO", "COMERCIAL", "FACTURACION", "OPERACIONES"]).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) => v.role !== undefined || v.active !== undefined,
    "Pasa al menos uno de: role, active",
  );

async function countActiveCEOsExcluding(excludeId: string): Promise<number> {
  return prisma.adminUser.count({
    where: { role: "CEO", active: true, NOT: { id: excludeId } },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, "CEO");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { id } = await params;

  if (id === auth.session.userId) {
    return NextResponse.json(
      {
        error: "SELF_MODIFY",
        message: "No puedes modificarte a ti mismo desde esta vista",
      },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const target = await prisma.adminUser.findUnique({
    where: { id },
    select: { id: true, role: true, active: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Guarda último CEO: si target es CEO activo y la operación lo dejaría
  // inactivo o con otro rol, rechazar si no hay otro CEO activo.
  const wouldLoseCEOStatus =
    (parsed.data.role !== undefined && parsed.data.role !== "CEO") ||
    (parsed.data.active === false);
  if (target.role === "CEO" && target.active && wouldLoseCEOStatus) {
    const otherActiveCEOs = await countActiveCEOsExcluding(id);
    if (otherActiveCEOs === 0) {
      return NextResponse.json(
        {
          error: "LAST_CEO",
          message:
            "No puedes degradar/desactivar al último CEO activo. " +
            "Crea otro CEO antes.",
        },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.adminUser.update({
    where: { id },
    data: {
      ...(parsed.data.role !== undefined
        ? { role: parsed.data.role as AdminRole }
        : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}
