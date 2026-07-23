import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { midoceanOrders } from "@/lib/suppliers/midocean-orders";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { withCronLock } from "@/lib/cron-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron que refresca tracking de todos los pedidos ORDERED activos.
 * Llamar 1-2 veces al día desde cron-job.org.
 *
 * Salta los que ya están en estado terminal (DELIVERED) y los que
 * tienen tracking actualizado en las últimas 6h para no machacar la API.
 *
 * Bajo cron-lock (2026-07-23): el filtro de "<6h" se evalúa leyendo el último
 * OrderTracking y la fila nueva se inserta después, así que dos ejecuciones
 * solapadas —el tick y un disparo manual desde /admin/system/crons— leían
 * ambas el mismo "último tracking" viejo e insertaban DOS filas por pedido,
 * ensuciando el historial que el cliente ve en /clientes y duplicando llamadas
 * a la API del proveedor. El lock las serializa; la segunda sale con skipped.
 */
export const POST = wrapCronHandler("refresh-tracking", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  // TTL 10 min: mayor que maxDuration (300 s) y muy por debajo de la cadencia
  // real del cron (cada 6h), así que nunca bloquea un tick legítimo.
  return withCronLock("refresh-tracking", async () => {

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
  }) as Promise<NextResponse>;
});

function pickString(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    if (typeof obj[k] === "string") return obj[k] as string;
  }
  return undefined;
}
