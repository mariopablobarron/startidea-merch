import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista productos con sus overrides — para vista /admin/products.
 *
 * Query params:
 *   q          búsqueda en name/supplierRef
 *   filter     all | featured | hidden | edited | active (default: active)
 *   page       1..N
 *   perPage    default 30, max 100
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const filter = url.searchParams.get("filter") || "active";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, parseInt(url.searchParams.get("perPage") || "30", 10) || 30);

  const where: Prisma.ProductWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { supplierRef: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filter === "active" ? { active: true } : {}),
    ...(filter === "featured" ? { override: { is: { featured: true } } } : {}),
    ...(filter === "hidden" ? { override: { is: { hidden: true } } } : {}),
    ...(filter === "edited" ? { override: { isNot: null } } : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        slug: true,
        name: true,
        supplierRef: true,
        primaryImageUrl: true,
        fromPriceCents: true,
        active: true,
        category: { select: { name: true } },
        override: {
          select: {
            customName: true,
            customFromPriceCents: true,
            marginPct: true,
            featured: true,
            hidden: true,
            marketingTags: true,
            extraImages: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    ok: true,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    items: products,
  });
}
