import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { midoceanOrders } from "@/lib/suppliers/midocean-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron que refresca tracking de todos los pedidos ORDERED activos.
 * Llamar 1-2 veces al día desde cron-job.org.
 *
 * Salta los que ya están en estado terminal (DELIVERED) y los que
 * tienen tracking actualizado en las últimas 6h para no machacar la API.
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const orders = await prisma.cartQuote.findMany({
    where: {
      status: "ORDERED",
      midoceanOrderId: { not: null },
    },
    select: {
      id: true,
      midoceanOrderId: true,
      midoceanOrderStatus: true,
      trackings: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: { fetchedAt: true, status: true },
      },
    },
    take: 50,
  });

  let refreshed = 0;
  let skipped = 0;
  let failed = 0;

  for (const order of orders) {
    const last = order.trackings[0];
    // Skip si entregado
    if (last?.status?.match(/deliver|entreg/i)) {
      skipped++;
      continue;
    }
    // Skip si actualizado recientemente (<6h)
    if (last && last.fetchedAt > sixHoursAgo) {
      skipped++;
      continue;
    }

    try {
      const result = await midoceanOrders.getOrderDetail(order.midoceanOrderId!);
      if (!result.ok) {
        failed++;
        continue;
      }
      const data = result.data as Record<string, unknown> | undefined;
      const status = pickString(data, ["status", "ORDER_STATUS"]);
      const trackingCode = pickString(data, ["tracking_code", "TRACKING_NUMBER"]);
      const carrier = pickString(data, ["carrier", "CARRIER"]);
      const carrierUrl = pickString(data, ["carrier_url", "CARRIER_URL"]);

      await prisma.orderTracking.create({
        data: {
          cartId: order.id,
          status,
          trackingCode,
          carrier,
          carrierUrl,
          rawJson: result.data as Prisma.InputJsonValue,
        },
      });

      if (status && status !== order.midoceanOrderStatus) {
        await prisma.cartQuote.update({
          where: { id: order.id },
          data: { midoceanOrderStatus: status },
        });
      }
      refreshed++;
    } catch (e) {
      console.error("[refresh-tracking]", order.id, e);
      failed++;
    }

    // Throttle suave
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    ok: true,
    total: orders.length,
    refreshed,
    skipped,
    failed,
  });
}

function pickString(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    if (typeof obj[k] === "string") return obj[k] as string;
  }
  return undefined;
}
