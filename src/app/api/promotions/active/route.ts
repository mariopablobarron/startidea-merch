import { NextResponse } from "next/server";
import { loadActivePromotions, getBadgeText } from "@/lib/promotions";
import { publicProductName } from "@/lib/product-name";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60; // cache 1 min — promos no cambian a cada segundo

/**
 * GET /api/promotions/active
 *
 * Endpoint público (sin auth) que devuelve las promociones vigentes con
 * displayInList=true, enriquecidas con nombres legibles (categorías,
 * productos) para que cualquier consumidor — /promociones, footer,
 * banner inteligente, webview embedida — pueda pintarlas sin replicar
 * la query y el join.
 *
 * Response:
 *   {
 *     ok: true,
 *     count: 2,
 *     promotions: [{
 *       slug, name, description,
 *       kind, value, badge,
 *       scope, target_names: ["Mochilas", "Bolsos"],
 *       starts_at, ends_at,
 *       badge_color,
 *     }]
 *   }
 */
export async function GET() {
  const promos = await loadActivePromotions();
  const visible = promos.filter((p) => p.displayInList);

  if (visible.length === 0) {
    return NextResponse.json({ ok: true, count: 0, promotions: [] });
  }

  // Cargar nombres para CATEGORY / PRODUCT_LIST
  const categoryIds = visible.filter((p) => p.scope === "CATEGORY").flatMap((p) => p.targetIds);
  const productIds = visible.filter((p) => p.scope === "PRODUCT_LIST").flatMap((p) => p.targetIds);
  const [categories, products] = await Promise.all([
    categoryIds.length > 0
      ? prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([]),
    productIds.length > 0
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            override: { select: { customName: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
  const prodMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const promotions = visible.map((p) => {
    let target_names: string[] = [];
    let target_links: string[] = [];
    switch (p.scope) {
      case "ALL":
        target_names = ["Todo el catálogo"];
        target_links = ["/catalogo"];
        break;
      case "CATEGORY":
        target_names = p.targetIds.map((id) => catMap[id]?.name).filter(Boolean) as string[];
        target_links = p.targetIds
          .map((id) => catMap[id]?.slug)
          .filter(Boolean)
          .map((slug) => `/catalogo?cat=${slug}`);
        break;
      case "BRAND":
        target_names = p.targetIds;
        break;
      case "TAG":
        target_names = p.targetIds;
        target_links = ["/promociones"];
        break;
      case "PRODUCT_LIST":
        target_names = p.targetIds
          .map((id) => prodMap[id])
          .filter((target): target is NonNullable<typeof target> => Boolean(target))
          .map((target) => publicProductName(target.name, target.override?.customName));
        target_links = p.targetIds
          .map((id) => prodMap[id]?.slug)
          .filter(Boolean)
          .map((slug) => `/catalogo/${slug}`);
        break;
    }

    return {
      slug: p.slug,
      name: p.name,
      description: p.description,
      kind: p.kind,
      value: p.value,
      badge: getBadgeText(p),
      badge_color: p.badgeColor || "#E63E73",
      scope: p.scope,
      target_names,
      target_links,
      starts_at: p.startsAt.toISOString(),
      ends_at: p.endsAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    count: promotions.length,
    promotions,
  });
}
