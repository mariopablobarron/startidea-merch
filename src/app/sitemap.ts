import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SECTORS } from "@/lib/sectors";
import { tagToSlug } from "@/lib/blog-tags";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

// Renderizar en request time, no en build. Sin esto, el sitemap se prerender
// con BD vacía y queda cacheado para siempre (solo 12 URLs estáticas).
export const dynamic = "force-dynamic";
export const revalidate = 3600;

function uniqueByUrl(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  const unique = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of entries) {
    if (!unique.has(entry.url)) unique.set(entry.url, entry);
  }
  return [...unique.values()];
}

/**
 * Sitemap dinámico:
 *   - Páginas estáticas core
 *   - Productos activos no-hidden (slug)
 *   - Categorías
 *   - Blog posts publicados
 *
 * Si la BD está caída en build, devuelve solo las estáticas (degradación).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/catalogo`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/categorias`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/promociones`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/trabajos`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/recursos`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/recomendador`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/comparar`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/sectores`, changeFrequency: "monthly", priority: 0.8 },
    // /clientes NO va en sitemap — es portal privado con robots: noindex
    { url: `${BASE}/sobre`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/ayuda`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/faq`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/aviso-legal`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/cookies`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const [products, categories, posts, magnets] = await Promise.all([
      prisma.product.findMany({
        where: { active: true, NOT: { override: { is: { hidden: true } } } },
        select: { slug: true },
        orderBy: { slug: "asc" },
      }),
      prisma.category.findMany({
        select: { slug: true },
        orderBy: [{ slug: "asc" }, { id: "asc" }],
      }),
      prisma.blogPost.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, updatedAt: true, tags: true },
        orderBy: { slug: "asc" },
      }),
      prisma.leadMagnet.findMany({
        where: { active: true },
        select: { slug: true },
        orderBy: { slug: "asc" },
      }),
    ]);

    // Product.syncedAt registra cada consulta al proveedor aunque el contenido
    // no haya cambiado. No es un lastmod editorial fiable: es preferible
    // omitirlo a decir a buscadores que miles de fichas cambian en cada sync.
    const productPages: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${BASE}/catalogo/${p.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    // Category.slug solo es único dentro de su padre. La URL pública, en
    // cambio, usa únicamente el slug, así que varios nodos "otros" o
    // "mochilas" representan la MISMA URL y deben aparecer una sola vez.
    const categoryPages: MetadataRoute.Sitemap = [
      ...new Set(categories.map((c) => c.slug)),
    ].map((slug) => ({
      url: `${BASE}/categorias/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

    // Un tag sí puede heredar una fecha real: la última edición de cualquiera
    // de los posts publicados que alimentan su landing.
    const tagUpdatedAt = new Map<string, Date>();
    for (const post of posts) {
      for (const tag of post.tags) {
        const slug = tagToSlug(tag);
        if (!slug) continue;
        const previous = tagUpdatedAt.get(slug);
        if (!previous || post.updatedAt > previous)
          tagUpdatedAt.set(slug, post.updatedAt);
      }
    }
    const tagPages: MetadataRoute.Sitemap = [...tagUpdatedAt.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([slug, updatedAt]) => ({
        url: `${BASE}/blog/tag/${slug}`,
        lastModified: updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    // LeadMagnet.updatedAt también cambia al incrementar downloadCount. Hasta
    // disponer de una fecha editorial separada, no se publica como lastmod.
    const magnetPages: MetadataRoute.Sitemap = magnets.map((m) => ({
      url: `${BASE}/recursos/${m.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

    // 6 landings dinámicas de sectores — programmatic SEO real
    const sectorPages: MetadataRoute.Sitemap = SECTORS.map((s) => ({
      url: `${BASE}/sectores/${s.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

    return uniqueByUrl([
      ...staticPages,
      ...sectorPages,
      ...productPages,
      ...categoryPages,
      ...blogPages,
      ...tagPages,
      ...magnetPages,
    ]);
  } catch {
    // Mismo fallback pero incluyendo sectores (estáticos en /lib/sectors)
    const sectorPages: MetadataRoute.Sitemap = SECTORS.map((s) => ({
      url: `${BASE}/sectores/${s.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
    return uniqueByUrl([...staticPages, ...sectorPages]);
  }
}
