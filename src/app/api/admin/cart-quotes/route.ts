import { NextResponse } from "next/server";
import type { CartQuoteStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES: CartQuoteStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "SENT",
  "CONFIRMED",
  "ORDERED",
  "ARCHIVED",
  "LOST",
];

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status = VALID_STATUSES.includes(statusParam as CartQuoteStatus)
    ? (statusParam as CartQuoteStatus)
    : null;
  const where: Prisma.CartQuoteWhereInput = status ? { status } : {};

  const [carts, grouped] = await Promise.all([
    prisma.cartQuote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { items: true } } },
    }),
    // Embudo: conteo + valor estimado por estado (sobre TODO, no filtrado).
    prisma.cartQuote.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { estimatedTotalCents: true },
    }),
  ]);

  const summary = grouped.map((g) => ({
    status: g.status,
    count: g._count._all,
    valueCents: g._sum.estimatedTotalCents ?? 0,
  }));

  return NextResponse.json({
    items: carts.map((c) => ({
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      status: c.status,
      estimatedTotalCents: c.estimatedTotalCents,
      itemsCount: c._count.items,
      paymentLinkSentAt: c.paymentLinkSentAt ? c.paymentLinkSentAt.toISOString() : null,
    })),
    summary,
  });
}
