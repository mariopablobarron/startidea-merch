import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { CartItem } from "@/lib/cart-storage";

export const runtime = "nodejs";
// El contenido depende del id y muta estado (recoveredAt); nunca cachear.
export const dynamic = "force-dynamic";

/**
 * Recuperación de carritos abandonados — endpoint público por id de CartQuote.
 *
 * Lo usan los emails de recordatorio (crons abandoned-cart-drip /
 * abandoned-reminders y /api/admin/cart-quotes/[id]/remind), cuyo CTA "Retomar
 * mi cotización" apunta a /cotizar?recover={cartId} → /carrito?recover={cartId}.
 * Cuando el cliente abre ese enlace en OTRO dispositivo, su localStorage está
 * vacío; la CartPage hace GET aquí para rehidratar la cesta.
 *
 * GET  → items del carrito en el shape de CartItem (lo que necesita el cliente
 *        para rehidratar localStorage). NO devuelve contacto, notas internas ni
 *        referencias de proveedor: CartQuoteItem sólo guarda productRef (el ref
 *        público que ya se muestra en la ficha) — no hay supplierRef que filtrar
 *        (regla: nunca exponer proveedores al cliente).
 * POST → marca recoveredAt = now() (idempotente). Alimenta la métrica
 *        "recovered" / "recoveryRatePct" de /api/admin/analytics/business, que
 *        hasta ahora era siempre 0 porque nadie seteaba el campo.
 */

// Sólo los campos de CartQuoteItem que el cliente necesita para reconstruir su
// cesta. Mantiene paridad con el shape CartItem de @/lib/cart-storage.
const ITEM_SELECT = {
  productSlug: true,
  productRef: true,
  productName: true,
  primaryImageUrl: true,
  quantity: true,
  variantSku: true,
  colorName: true,
  markingTechniqueCode: true,
  markingTechniqueName: true,
  markingPositionId: true,
  markingColours: true,
  markingComplexity: true,
  unitPriceClientCents: true,
  totalClientCents: true,
  notes: true,
  customerLogoUrl: true,
  customerLogoFilename: true,
  customerLogoSize: true,
  markings: {
    select: {
      positionId: true,
      positionLabel: true,
      techniqueCode: true,
      techniqueName: true,
      numberOfColors: true,
      manipulationCode: true,
      notes: true,
    },
    orderBy: { order: "asc" as const },
  },
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: { id: true, items: { select: ITEM_SELECT } },
  });
  if (!cart) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  const items: CartItem[] = cart.items.map((it) => ({
    productSlug: it.productSlug,
    productRef: it.productRef,
    productName: it.productName,
    primaryImageUrl: it.primaryImageUrl,
    quantity: it.quantity,
    variantSku: it.variantSku,
    colorName: it.colorName,
    markingTechniqueCode: it.markingTechniqueCode,
    markingTechniqueName: it.markingTechniqueName,
    markingPositionId: it.markingPositionId,
    markingColours: it.markingColours,
    markingComplexity: it.markingComplexity,
    unitPriceClientCents: it.unitPriceClientCents,
    totalClientCents: it.totalClientCents,
    notes: it.notes,
    customerLogoUrl: it.customerLogoUrl,
    customerLogoFilename: it.customerLogoFilename,
    customerLogoSize: it.customerLogoSize,
    markings:
      it.markings.length > 0
        ? it.markings.map((m) => ({
            positionId: m.positionId,
            positionLabel: m.positionLabel,
            techniqueCode: m.techniqueCode,
            techniqueName: m.techniqueName,
            numberOfColors: m.numberOfColors,
            manipulationCode: m.manipulationCode,
            notes: m.notes,
          }))
        : undefined,
  }));

  return NextResponse.json({ ok: true, id: cart.id, items });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: { id: true, recoveredAt: true },
  });
  if (!cart) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  // Idempotente: sólo registramos el PRIMER retorno tras el recordatorio, así
  // refrescar el enlace no pisa la fecha original ni infla la métrica.
  if (!cart.recoveredAt) {
    await prisma.cartQuote.update({
      where: { id },
      data: { recoveredAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
