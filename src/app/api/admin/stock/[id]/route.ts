import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Detalle de stock de un producto: breakdown por variante.
 * GET     devuelve product + variantes con stock + override tags
 * PATCH   toggle del tag 'needs-restock' en ProductOverride.marketingTags
 *         body: { needsRestock: boolean }
 */

const PatchSchema = z
  .object({ needsRestock: z.boolean() })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: {
        select: {
          id: true,
          sku: true,
          colorName: true,
          colorHex: true,
          colorGroup: true,
          size: true,
          stockQty: true,
          stockUpdatedAt: true,
          imageUrl: true,
        },
        orderBy: [{ stockQty: "asc" }, { sku: "asc" }],
      },
      category: { select: { name: true } },
      override: { select: { marketingTags: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true, product });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "OPERACIONES" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  // Toggle del tag 'needs-restock' en ProductOverride.marketingTags
  const existing = await prisma.productOverride.findUnique({
    where: { productId: id },
    select: { marketingTags: true },
  });

  const currentTags = existing?.marketingTags ?? [];
  const newTags = parsed.data.needsRestock
    ? Array.from(new Set([...currentTags, "needs-restock"]))
    : currentTags.filter((t) => t !== "needs-restock");

  await prisma.productOverride.upsert({
    where: { productId: id },
    update: { marketingTags: newTags, updatedBy: session.email },
    create: {
      productId: id,
      marketingTags: newTags,
      updatedBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, needsRestock: parsed.data.needsRestock });
}
