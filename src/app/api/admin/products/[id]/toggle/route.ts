import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Toggle rápido de flags featured/hidden desde la lista admin.
 * Crea ProductOverride si no existe.
 */
const ToggleSchema = z
  .object({
    featured: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: "Falta featured o hidden" });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const result = await prisma.productOverride.upsert({
    where: { productId: id },
    update: { ...parsed.data, updatedBy: session.email },
    create: { productId: id, ...parsed.data, updatedBy: session.email },
    select: { featured: true, hidden: true },
  });

  return NextResponse.json({ ok: true, override: result });
}
