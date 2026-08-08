import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SECTORS } from "@/lib/sectors";
import { tagToSlug } from "@/lib/blog-tags";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

// Renderizar en request time, no en build. Sin esto, el sitemap se prerender
// con BD vacía y queda cacheado para siempre (solo 12 URLs estáticas).
export const dynamic = "force-dynamic";
export const revalidate = 3600;

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
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/catalogo`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/categorias`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/promociones`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/trabajos`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/recursos`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/recomendador`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/comparar`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/sectores`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    // /clientes NO va en sitemap — es portal privado con robots: noindex
    { url: `${BASE}/sobre`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/ayuda`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/aviso-legal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const [products, categories, posts, magnets] = await Promise.all([
      prisma.product.findMany({
        where: { active: true, NOT: { override: { is: { hidden: true } } } },
        select: { slug: true, syncedAt: true },
        orderBy: { slug: "asc" },
      }),
      prisma.category.findMany({ select: { slug: true } }),
      prisma.blogPost.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, updatedAt: true },
      }),
      prisma.leadMagnet.findMany({
        where: { active: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    const productPages: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${BASE}/catalogo/${p.slug}`,
      lastModified: p.syncedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const categoryPages: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${BASE}/categorias/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

    // Páginas por tag del blog (clúster temático). Re-query con tags ya que
    // arriba el select no los incluyó.
    const postsWithTags = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      select: { tags: true },
    });
    const uniqueTagSlugs = new Set<string>();
    postsWithTags.forEach((p) =>
      p.tags.forEach((t) => uniqueTagSlugs.add(tagToSlug(t))),
    );
    const tagPages: MetadataRoute.Sitemap = Array.from(uniqueTagSlugs).map((slug) => ({
      url: `${BASE}/blog/tag/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const magnetPages: MetadataRoute.Sitemap = magnets.map((m) => ({
      url: `${BASE}/recursos/${m.slug}`,
      lastModified: m.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

    // 6 landings dinámicas de sectores — programmatic SEO real
    const sectorPages: MetadataRoute.Sitemap = SECTORS.map((s) => ({
      url: `${BASE}/sectores/${s.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

    return [
      ...staticPages,
      ...sectorPages,
      ...productPages,
      ...categoryPages,
      ...blogPages,
      ...tagPages,
      ...magnetPages,
    ];
  } catch {
    // Mismo fallback pero incluyendo sectores (estáticos en /lib/sectors)
    const sectorPages: MetadataRoute.Sitemap = SECTORS.map((s) => ({
      url: `${BASE}/sectores/${s.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
    return [...staticPages, ...sectorPages];
  }
}
