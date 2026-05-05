import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const carts = await prisma.cartQuote.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { items: true } } },
  });
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
    })),
  });
}
