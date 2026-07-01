import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { computeCotizacion, type CotizarInput } from "@/lib/cotizar-core";
import { recomputeCartTotal, LOCKED_EDIT_STATUSES } from "@/lib/cart-quote-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cart-quotes/[id]/items
 *
 * Añade una línea a un presupuesto existente. Re-cotiza server-side con
 * computeCotizacion (misma matemática que el cotizador) y persiste el
 * CartQuoteItem con snapshot SIN IVA. Recalcula el total del presupuesto.
 * Nunca persiste supplierRef (usa publicRef). Bloqueado si ORDERED/ARCHIVED.
 */

const Schema = z.object({
  ref: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(100_000),
  marginPct: z.number().min(0).max(900).optional(),
  techniqueCode: z.string().min(1).max(20).optional(),
  numberOfColours: z.number().int().min(1).max(12).optional(),
  portesCents: z.number().int().min(0).max(1_000_000).optional(),
  couponCode: z.string().min(1).max(40).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;

  const cart = await prisma.cartQuote.findUnique({ where: { id }, select: { status: true } });
  if (!cart) return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
  if (LOCKED_EDIT_STATUSES.has(cart.status)) {
    return NextResponse.json(
      { error: "El pedido ya está en producción; no se pueden añadir líneas." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const result = await computeCotizacion(parsed.data as CotizarInput);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await prisma.cartQuoteItem.create({
    data: {
      cartId: id,
      productSlug: result.product.slug,
      productRef: result.product.publicRef, // NUNCA supplierRef
      productName: result.product.name,
      primaryImageUrl: result.product.imageUrl,
      quantity: result.qty,
      markingTechniqueCode: result.marking?.techniqueCode ?? null,
      markingTechniqueName: result.marking?.techniqueLabel ?? null,
      markingColours: parsed.data.numberOfColours ?? null,
      unitPriceClientCents: result.pvp.unit,
      totalClientCents: result.pvp.baseTotal,
    },
  });
  const estimatedTotalCents = await recomputeCartTotal(id);
  return NextResponse.json({ ok: true, estimatedTotalCents });
}
