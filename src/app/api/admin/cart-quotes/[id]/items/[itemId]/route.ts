import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { recomputeCartTotal, LOCKED_EDIT_STATUSES } from "@/lib/cart-quote-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH  /api/admin/cart-quotes/[id]/items/[itemId]  → edita cantidad y/o precio
 *        unitario de una línea; recalcula su total y el del presupuesto.
 * DELETE /api/admin/cart-quotes/[id]/items/[itemId]  → quita la línea.
 *
 * Bloqueado si el pedido ya está ORDERED/ARCHIVED (evita desincronizar POs).
 */

const PatchSchema = z.object({
  quantity: z.number().int().min(1).max(1_000_000).optional(),
  unitPriceClientCents: z.number().int().min(0).max(100_000_000).optional(),
});

async function loadCartAndItem(id: string, itemId: string) {
  const cart = await prisma.cartQuote.findUnique({ where: { id }, select: { status: true } });
  if (!cart) return { error: "Presupuesto no encontrado", status: 404 as const };
  if (LOCKED_EDIT_STATUSES.has(cart.status)) {
    return { error: "El pedido ya está en producción; no se pueden editar las líneas.", status: 409 as const };
  }
  const item = await prisma.cartQuoteItem.findFirst({ where: { id: itemId, cartId: id } });
  if (!item) return { error: "Línea no encontrada", status: 404 as const };
  return { item };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id, itemId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const loaded = await loadCartAndItem(id, itemId);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { item } = loaded;

  const quantity = parsed.data.quantity ?? item.quantity;
  const unitPriceClientCents = parsed.data.unitPriceClientCents ?? item.unitPriceClientCents;
  const totalClientCents = unitPriceClientCents != null ? unitPriceClientCents * quantity : null;

  await prisma.cartQuoteItem.update({
    where: { id: itemId },
    data: { quantity, unitPriceClientCents, totalClientCents },
  });
  const estimatedTotalCents = await recomputeCartTotal(id);
  return NextResponse.json({ ok: true, estimatedTotalCents });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id, itemId } = await params;

  const loaded = await loadCartAndItem(id, itemId);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  await prisma.cartQuoteItem.delete({ where: { id: itemId } });
  const estimatedTotalCents = await recomputeCartTotal(id);
  return NextResponse.json({ ok: true, estimatedTotalCents });
}
