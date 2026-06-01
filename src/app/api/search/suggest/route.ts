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

  // Antes de hacer la búsqueda, comprobar si hay alias admin para esta query.
  // Si existe → devolver redirectTo y dejar que el cliente navegue.
  const queryLower = q.toLowerCase();
  const alias = await prisma.searchAlias.findUnique({
    where: { queryLower },
    select: { redirectTo: true, active: true },
  });
  if (alias?.active && alias.redirectTo) {
    void prisma.searchAlias
      .update({
        where: { queryLower },
        data: { hitCount: { increment: 1 } },
      })
      .catch(() => {});
    return NextResponse.json(
      { redirectTo: alias.redirectTo, products: [], categories: [] },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
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

  // Log query para detectar demanda no cubierta. Solo cuando la búsqueda
  // tiene 3+ caracteres (filtra ruido) y no se repite del MISMO IP en
  // <30s (filtra typeahead que dispara con cada tecla).
  if (q.length >= 3) {
    void (async () => {
      try {
        const xff = req.headers.get("x-forwarded-for");
        const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
        const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
        const queryLower = q.toLowerCase();
        const totalResults = products.length + categories.length;

        // Dedup: si el mismo IP buscó la misma query en últimos 30s, no logear.
        if (ip) {
          const recent = await prisma.searchQuery.findFirst({
            where: {
              ip,
              queryLower,
              createdAt: { gte: new Date(Date.now() - 30_000) },
            },
            select: { id: true },
          });
          if (recent) return;
        }

        await prisma.searchQuery.create({
          data: { query: q, queryLower, resultsCount: totalResults, ip, ua },
        });
      } catch {
        // Silencioso, no bloquea la búsqueda
      }
    })();
  }

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
