import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { midoceanOrders } from "@/lib/suppliers/midocean-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consulta el detalle/tracking del pedido en MidOcean y guarda snapshot.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: { midoceanOrderId: true },
  });
  if (!cart?.midoceanOrderId) {
    return NextResponse.json({ error: "Carrito sin pedido MidOcean asociado" }, { status: 400 });
  }

  const result = await midoceanOrders.getOrderDetail(cart.midoceanOrderId);
  if (!result.ok) {
    return NextResponse.json(
      { error: "MidOcean tracking error", status: result.status, detail: result.error },
      { status: 502 },
    );
  }

  // Persistir snapshot
  const data = result.data as Record<string, unknown> | undefined;
  const status = pickString(data, ["status", "ORDER_STATUS"]);
  const trackingCode = pickString(data, ["tracking_code", "TRACKING_NUMBER"]);
  const carrier = pickString(data, ["carrier", "CARRIER"]);
  const carrierUrl = pickString(data, ["carrier_url", "CARRIER_URL"]);

  await prisma.orderTracking.create({
    data: {
      cartId: id,
      status,
      trackingCode,
      carrier,
      carrierUrl,
      rawJson: result.data as Prisma.InputJsonValue,
    },
  });

  if (status) {
    await prisma.cartQuote.update({
      where: { id },
      data: { midoceanOrderStatus: status },
    });
  }

  return NextResponse.json({ ok: true, status, trackingCode, carrier, carrierUrl, raw: result.data });
}

function pickString(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    if (typeof obj[k] === "string") return obj[k] as string;
  }
  return undefined;
}
