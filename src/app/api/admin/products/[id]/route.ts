import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Detalle producto + override (admin).
 *  - GET    devuelve producto con override
 *  - PUT    upsert override (CEO o COMERCIAL)
 *  - DELETE elimina override completo (CEO solamente)
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { name: true, slug: true } },
      override: true,
      variants: { take: 8, select: { sku: true, colorName: true, size: true, stockQty: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true, product });
}

const OverrideSchema = z
  .object({
    customName: z.string().min(1).max(220).nullable().optional(),
    customDescription: z.string().max(5000).nullable().optional(),
    customFromPriceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
    marginPct: z.number().int().min(-50).max(500).nullable().optional(),
    extraImages: z.array(z.string().url()).max(10).optional(),
    featured: z.boolean().optional(),
    hidden: z.boolean().optional(),
    marketingTags: z.array(z.string().min(1).max(40)).max(10).optional(),
    metaTitle: z.string().max(160).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
    internalNotes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = OverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Limpiar nulls a undefined para Prisma upsert (no hace falta diferenciar)
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  const result = await prisma.productOverride.upsert({
    where: { productId: id },
    update: { ...data, updatedBy: session.email },
    create: { productId: id, ...data, updatedBy: session.email },
  });

  return NextResponse.json({ ok: true, override: result });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar overrides" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.productOverride.delete({ where: { productId: id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
