import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/mockup-requests?status=NEW (opcional)
 * Devuelve listado de peticiones de mockup técnico para el admin.
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");

  const items = await prisma.mockupRequest.findMany({
    where: statusFilter
      ? { status: statusFilter as "NEW" | "IN_PROGRESS" | "DELIVERED" | "CANCELLED" }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      phone: true,
      brief: true,
      productSlug: true,
      positionId: true,
      status: true,
      createdAt: true,
      fulfilledAt: true,
      product: { select: { id: true, name: true } },
    },
  });

  const counts = await prisma.mockupRequest.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const summary = counts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r._count._all;
    return acc;
  }, {});

  return NextResponse.json({ items, summary });
}
