import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { emitWebhook } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    include: {
      items: true,
      proofs: {
        select: { status: true, decidedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      payments: {
        where: { status: "PAID" },
        select: { paidAt: true, amountCents: true },
        orderBy: { paidAt: "desc" },
      },
      trackings: {
        select: { status: true, fetchedAt: true, trackingCode: true, carrier: true },
        orderBy: { fetchedAt: "desc" },
      },
      // PurchaseOrders: lista de pedidos al proveedor (1 por supplier tras split)
      purchaseOrders: {
        orderBy: { createdAt: "asc" },
        include: {
          items: { select: { id: true, quantity: true, productName: true, productRef: true } },
        },
      },
    },
  });
  if (!cart) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(cart);
}

const PatchSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "SENT", "CONFIRMED", "ORDERED", "ARCHIVED", "LOST"]).optional(),
  internalNotes: z.string().max(4000).optional(),
  lostReason: z.string().max(500).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const before = await prisma.cartQuote.findUnique({
    where: { id },
    select: { status: true },
  });

  const { status, internalNotes, lostReason } = parsed.data;
  const data: Prisma.CartQuoteUpdateInput = {};
  if (internalNotes !== undefined) data.internalNotes = internalNotes;
  if (status !== undefined) {
    data.status = status;
    if (status === "LOST") {
      // Marcar perdida: sella la fecha y el motivo.
      data.lostAt = new Date();
      data.lostReason = lostReason ?? null;
    } else {
      // Salir de LOST limpia el sello de pérdida.
      data.lostAt = null;
      data.lostReason = null;
    }
  } else if (lostReason !== undefined) {
    data.lostReason = lostReason;
  }

  const updated = await prisma.cartQuote.update({
    where: { id },
    data,
  });

  // Webhook si cambió el estado
  if (parsed.data.status && before && before.status !== parsed.data.status) {
    void emitWebhook("quote.status.changed", {
      cartId: id,
      fromStatus: before.status,
      toStatus: parsed.data.status,
      at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, cart: updated });
}
