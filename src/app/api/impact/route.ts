import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KPIs reales del impacto generado por el negocio.
 * Endpoint público para mostrar contadores en la home.
 *
 * Métricas:
 *  - ordersFulfilled: CartQuote en estado ORDERED
 *  - itemsProduced: suma de quantity de items en carritos ORDERED
 *  - companiesServed: distinct emails con CartQuote ORDERED o CONFIRMED
 *  - co2SavedKg: estimación 1.2 kg CO2/producto evitado vs Asia
 *  - eurInvestedInCEE: total cobrado * 0.4 (estimación, % producción CEE)
 */
export async function GET() {
  const [
    ordersAgg,
    itemsAgg,
    companies,
    paymentsAgg,
    productsActive,
  ] = await Promise.all([
    prisma.cartQuote.count({ where: { status: "ORDERED" } }),
    prisma.cartQuoteItem.aggregate({
      _sum: { quantity: true },
      where: { cart: { status: "ORDERED" } },
    }),
    prisma.cartQuote
      .findMany({
        where: { status: { in: ["ORDERED", "CONFIRMED"] } },
        distinct: ["email"],
        select: { email: true },
      })
      .then((arr) => arr.length),
    prisma.payment.aggregate({
      where: { status: "PAID" },
      _sum: { amountCents: true },
    }),
    prisma.product.count({ where: { active: true } }),
  ]);

  const itemsProduced = itemsAgg._sum.quantity || 0;
  const eurPaid = (paymentsAgg._sum.amountCents || 0) / 100;
  const eurInvestedInCEE = Math.round(eurPaid * 0.4);
  const co2SavedKg = Math.round(itemsProduced * 1.2);

  return NextResponse.json(
    {
      ok: true,
      ordersFulfilled: ordersAgg,
      itemsProduced,
      companiesServed: companies,
      eurInvestedInCEE,
      co2SavedKg,
      productsActive,
    },
    {
      headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" },
    },
  );
}
