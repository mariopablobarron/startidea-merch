import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/clientes/[token]
 *
 * Dashboard cliente B2B con impacto agregado.
 * El token apunta a un CartQuote concreto (el primero que se le envió),
 * y mostramos TODOS los carritos pasados de ese email para construir
 * historial e impacto.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const seed = await prisma.cartQuote.findUnique({
    where: { customerToken: token },
    select: { email: true, name: true, company: true },
  });
  if (!seed) return NextResponse.json({ error: "Token no válido" }, { status: 404 });

  const carts = await prisma.cartQuote.findMany({
    where: { email: seed.email },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { quantity: true, productName: true, productRef: true, totalClientCents: true } },
      payments: { where: { status: "PAID" }, select: { amountCents: true, paidAt: true } },
    },
  });

  const ordered = carts.filter((c) => c.status === "ORDERED");
  const totalItems = ordered.reduce(
    (sum, c) => sum + c.items.reduce((s, it) => s + it.quantity, 0),
    0,
  );
  const totalPaid = carts.reduce(
    (sum, c) => sum + c.payments.reduce((s, p) => s + p.amountCents, 0),
    0,
  );
  const eurInvestedInCEE = Math.round(totalPaid * 0.4); // estimación 40%
  const co2SavedKg = Math.round(totalItems * 1.2);

  return NextResponse.json({
    ok: true,
    customer: { name: seed.name, company: seed.company, email: seed.email },
    summary: {
      totalCarts: carts.length,
      ordersCompleted: ordered.length,
      itemsProduced: totalItems,
      totalPaidCents: totalPaid,
      eurInvestedInCEE,
      co2SavedKg,
    },
    history: carts.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      orderedAt: c.orderedAt,
      status: c.status,
      itemsCount: c.items.length,
      total: c.acceptedTotalCents ?? c.estimatedTotalCents,
      paid: c.payments.reduce((s, p) => s + p.amountCents, 0),
      products: c.items.slice(0, 5).map((it) => ({
        name: it.productName,
        ref: it.productRef,
        quantity: it.quantity,
      })),
    })),
  });
}
