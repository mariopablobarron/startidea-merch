import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { publicRef } from "@/lib/internal-ref";
import { publicBrand } from "@/lib/brand-filter";
import { semanticSearch } from "@/lib/embeddings";
import { displayFromPrice } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  query: z.string().min(2).max(120),
  category: z.string().max(80).optional().nullable(),
  max_results: z.number().int().min(1).max(10).optional().default(6),
});

/**
 * Tool: search_products
 * El agente Carmen la usa cuando el usuario pregunta "¿tenéis bolígrafos?".
 * Devuelve lista corta optimizada para que Carmen la lea al usuario por voz.
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const { query, category, max_results } = parsed.data;

  // Estrategia híbrida:
  // 1) Intentamos semantic search (cosine sim sobre embeddings text-embedding-3-small).
  //    Si devuelve resultados → los usamos (mucho mejor recall que keyword match).
  // 2) Fallback a búsqueda LIKE tokenizada por si los embeddings aún no se
  //    han generado (cron embeddings-sync se ejecuta diario; primer run puede
  //    tardar varios batches en cubrir el catálogo entero).
  let semanticIds: string[] | null = null;
  try {
    const ranked = await semanticSearch(prisma, query, { topK: max_results, category });
    if (ranked.length > 0 && ranked[0].score > 0.2) {
      semanticIds = ranked.map((r) => r.productId);
    }
  } catch {
    semanticIds = null;
  }

  // Tokenizamos para fallback LIKE
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  const tokenConditions = tokens.length > 0 ? tokens : [query.trim()];

  const productsPromise = prisma.product.findMany({
    where: semanticIds
      ? {
          id: { in: semanticIds },
          active: true,
          NOT: { override: { hidden: true } },
        }
      : {
          active: true,
          AND: tokenConditions.map((t) => ({
            OR: [
              { name: { contains: t, mode: "insensitive" as const } },
              { shortDescription: { contains: t, mode: "insensitive" as const } },
              { longDescription: { contains: t, mode: "insensitive" as const } },
              { enhancedShortDescription: { contains: t, mode: "insensitive" as const } },
              { category: { name: { contains: t, mode: "insensitive" as const } } },
              { tags: { has: t } },
            ],
          })),
          ...(category
            ? { category: { name: { contains: category, mode: "insensitive" as const } } }
            : {}),
          NOT: { override: { hidden: true } },
        },
    take: max_results,
    orderBy: semanticIds ? undefined : [{ fromPriceCents: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      internalRef: true,
      name: true,
      brand: true,
      categoryId: true,
      shortDescription: true,
      enhancedShortDescription: true,
      fromPriceCents: true,
      category: { select: { name: true } },
      override: {
        select: {
          customName: true,
          customFromPriceCents: true,
          marginPct: true,
          marketingTags: true,
        },
      },
    },
  });

  // Precio CLIENTE (override admin > promo PERCENT > margen global) — el mismo
  // que la web. NUNCA el neto de proveedor: David se lo canta al cliente.
  // En paralelo con la búsqueda: no suma latencia.
  const [products, activePromos] = await Promise.all([productsPromise, loadActivePromotions()]);

  // Si fue semantic, preservar el orden devuelto por similitud
  const productsOrdered = semanticIds
    ? semanticIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is (typeof products)[number] => p != null)
    : products;

  return NextResponse.json({
    count: productsOrdered.length,
    search_mode: semanticIds ? "semantic" : "keyword",
    products: productsOrdered.map((p) => {
      const price = displayFromPrice(
        { id: p.id, name: p.name, brand: p.brand, categoryId: p.categoryId, fromPriceCents: p.fromPriceCents },
        p.override,
        activePromos,
      );
      return {
        ref: publicRef(p),
        slug: p.slug,
        name: p.override?.customName || p.name,
        brand: publicBrand(p.brand),
        short_description: p.enhancedShortDescription?.slice(0, 200) || p.shortDescription?.slice(0, 200) || null,
        category: p.category?.name || null,
        from_price_eur: price.finalCents != null ? price.finalCents / 100 : null,
        product_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es"}/catalogo/${p.slug}`,
      };
    }),
    note:
      products.length === 0
        ? `No encontré productos para "${query}". Pide al usuario que reformule (ej: 'termos', 'tote bag', 'libreta')`
        : null,
  });
}
