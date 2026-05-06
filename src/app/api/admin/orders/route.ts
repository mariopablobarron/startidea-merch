import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vista unificada de pedidos en producción + entregados recientes.
 * Cruza CartQuote.status con OrderTracking más reciente y OrderProof
 * para construir el "estado real" actual.
 */
export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "active"; // active|all|stale
  const days = filter === "stale" ? 14 : 0;
  const since = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

  const where: Prisma.CartQuoteWhereInput =
    filter === "all"
      ? {}
      : filter === "stale"
        ? { status: "ORDERED", orderedAt: since ? { lt: since } : undefined }
        : { status: { in: ["CONFIRMED", "ORDERED"] } };

  const carts = await prisma.cartQuote.findMany({
    where,
    orderBy: [{ orderedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      items: { select: { quantity: true, productName: true, productRef: true }, take: 5 },
      proofs: {
        select: { status: true, decidedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      trackings: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: {
          status: true,
          trackingCode: true,
          carrier: true,
          carrierUrl: true,
          fetchedAt: true,
        },
      },
      payments: {
        where: { status: "PAID" },
        select: { amountCents: true, paidAt: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    count: carts.length,
    items: carts.map((c) => {
      const totalUnits = c.items.reduce((s, it) => s + it.quantity, 0);
      const totalPaid = c.payments.reduce((s, p) => s + p.amountCents, 0);
      const lastProof = c.proofs[0];
      const lastTracking = c.trackings[0];
      const daysOrdered = c.orderedAt
        ? Math.floor((Date.now() - new Date(c.orderedAt).getTime()) / 86_400_000)
        : null;

      // Stage real (lo más avanzado)
      let stage: "RECEIVED" | "REVIEWING" | "QUOTE_SENT" | "PAID" | "PROOF_PENDING" | "PROOF_APPROVED" | "IN_PRODUCTION" | "SHIPPED" | "DELIVERED" | "ARCHIVED";
      if (c.status === "ARCHIVED") stage = "ARCHIVED";
      else if (lastTracking?.status?.match(/deliver|entreg/i)) stage = "DELIVERED";
      else if (lastTracking?.status?.match(/ship|env[ií]/i) || lastTracking?.trackingCode) stage = "SHIPPED";
      else if (c.status === "ORDERED") stage = "IN_PRODUCTION";
      else if (lastProof?.status === "APPROVED") stage = "PROOF_APPROVED";
      else if (lastProof?.status === "PENDING") stage = "PROOF_PENDING";
      else if (totalPaid > 0) stage = "PAID";
      else if (c.status === "SENT") stage = "QUOTE_SENT";
      else if (c.status === "IN_PROGRESS") stage = "REVIEWING";
      else stage = "RECEIVED";

      return {
        id: c.id,
        createdAt: c.createdAt,
        orderedAt: c.orderedAt,
        confirmedAt: c.confirmedAt,
        name: c.name,
        company: c.company,
        email: c.email,
        status: c.status,
        stage,
        itemsCount: c.items.length,
        unitsCount: totalUnits,
        topItems: c.items.slice(0, 3).map((it) => `${it.quantity}× ${it.productName}`),
        midoceanOrderId: c.midoceanOrderId,
        midoceanOrderStatus: c.midoceanOrderStatus,
        proofStatus: lastProof?.status || null,
        tracking: lastTracking
          ? {
              status: lastTracking.status,
              code: lastTracking.trackingCode,
              carrier: lastTracking.carrier,
              url: lastTracking.carrierUrl,
              fetchedAt: lastTracking.fetchedAt,
            }
          : null,
        paidCents: totalPaid,
        acceptedTotalCents: c.acceptedTotalCents,
        daysOrdered,
        deadline: c.deadline,
      };
    }),
  });
}
