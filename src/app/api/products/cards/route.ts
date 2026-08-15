import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { displayFromPrice } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";
import { proxyImageUrl } from "@/lib/proxy-image";
import { publicRef } from "@/lib/internal-ref";
import { publicProductName } from "@/lib/product-name";
import { resolveProductsBySlugs } from "@/lib/product-slug-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tarjetas ligeras de producto para el widget de David (tool mostrar_productos):
 * foto (vía proxy /api/m/), nombre, ref pública y precio "desde" con la MISMA
 * lógica que el catálogo (override admin > promo PERCENT > margen global).
 * Solo productos activos y no ocultos; jamás datos de proveedor.
 */
export async function GET(req: Request) {
  const rl = rateLimit(req, { key: "product-cards", max: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const url = new URL(req.url);
  const slugs = (url.searchParams.get("slugs") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]{1,160}$/.test(s))
    .slice(0, 6);
  if (slugs.length === 0) return NextResponse.json({ items: [] });

  const [resolvedProducts, promos] = await Promise.all([
    resolveProductsBySlugs(slugs, (candidateSlugs) =>
      prisma.product.findMany({
        where: {
          slug: { in: [...candidateSlugs] },
          active: true,
          NOT: { override: { is: { hidden: true } } },
        },
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          internalRef: true,
          primaryImageUrl: true,
          fromPriceCents: true,
          categoryId: true,
          _count: { select: { variants: true } },
          variants: { take: 1, select: { id: true } },
          override: {
            select: {
              customName: true,
              customFromPriceCents: true,
              marginPct: true,
              marketingTags: true,
            },
          },
        },
      }),
    ),
    loadActivePromotions(),
  ]);

  // Conservamos el orden pedido (David los cita en un orden concreto).
  const items = slugs
    .map((s) => resolvedProducts.get(s)?.product)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => {
      const price = displayFromPrice(
        {
          id: p.id,
          name: p.name,
          brand: p.brand,
          categoryId: p.categoryId,
          fromPriceCents: p.fromPriceCents,
        },
        p.override,
        promos,
      );
      return {
        slug: p.slug,
        name: publicProductName(p.name, p.override?.customName),
        ref: publicRef(p),
        image: proxyImageUrl(p.primaryImageUrl),
        priceFromCents: price.finalCents,
        originalFromCents:
          price.hasPromo && price.originalCents !== price.finalCents ? price.originalCents : null,
        variantId: p._count.variants === 1 ? p.variants[0]?.id ?? null : null,
        requiresVariantSelection: p._count.variants > 1,
        url: `/catalogo/${p.slug}`,
      };
    });

  return NextResponse.json({ items });
}
