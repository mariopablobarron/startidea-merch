import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Autocompletado del nav. Devuelve top productos por coincidencia de nombre + categorías.
 * GET /api/search/suggest?q=cami
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ products: [], categories: [] }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { supplierRef: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ name: "asc" }],
      take: 8,
      select: {
        slug: true,
        name: true,
        supplierRef: true,
        primaryImageUrl: true,
        category: { select: { name: true } },
      },
    }),
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: [{ level: "asc" }, { name: "asc" }],
      take: 5,
      select: { slug: true, name: true, level: true, parent: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json(
    {
      products: products.map((p) => ({
        slug: p.slug,
        name: p.name,
        ref: p.supplierRef,
        imageUrl: p.primaryImageUrl,
        category: p.category?.name,
      })),
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        path: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
      })),
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
