import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

/**
 * Server component que muestra hasta 3 posts relacionados al final
 * de cada blog post. Estrategia de selección:
 *
 *   1. Posts PUBLISHED que comparten ≥1 tag con el actual (más fuerte)
 *   2. Si no hay suficientes, completa con los últimos posts del blog
 *
 * El post actual se excluye siempre.
 *
 * Beneficios:
 *  - Reduce bounce rate (más navegación dentro del sitio)
 *  - Internal linking → mejor SEO
 *  - Mantiene al usuario más tiempo → conversión más alta
 */
export async function RelatedPosts({
  currentSlug,
  currentTags,
}: {
  currentSlug: string;
  currentTags: string[];
}) {
  let related = [] as Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    heroUrl: string | null;
    tags: string[];
    publishedAt: Date | null;
  }>;

  try {
    // Paso 1: posts con tags comunes
    if (currentTags.length > 0) {
      related = await prisma.blogPost.findMany({
        where: {
          status: "PUBLISHED",
          slug: { not: currentSlug },
          tags: { hasSome: currentTags },
        },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          heroUrl: true,
          tags: true,
          publishedAt: true,
        },
      });
    }

    // Paso 2: completar con los últimos si faltan
    if (related.length < 3) {
      const fillCount = 3 - related.length;
      const excludeIds = [currentSlug, ...related.map((r) => r.slug)];
      const fill = await prisma.blogPost.findMany({
        where: {
          status: "PUBLISHED",
          slug: { notIn: excludeIds },
        },
        orderBy: { publishedAt: "desc" },
        take: fillCount,
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          heroUrl: true,
          tags: true,
          publishedAt: true,
        },
      });
      related = [...related, ...fill];
    }
  } catch {
    return null;
  }

  if (related.length === 0) return null;

  return (
    <section className="mt-16 border-t border-line pt-12">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
        — Sigue leyendo
      </p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-ink lg:text-3xl">
        Otros artículos que te pueden interesar
      </h2>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((p) => (
          <li key={p.id}>
            <Link
              href={`/blog/${p.slug}`}
              className="group block h-full overflow-hidden rounded-2xl border border-line bg-bone transition hover:border-accent/40 hover:shadow-md"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-bone-soft">
                <Image
                  src={p.heroUrl || `/blog/${p.slug}/opengraph-image`}
                  alt=""
                  fill
                  sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                  unoptimized
                />
              </div>
              <div className="p-4">
                {p.tags.length > 0 && (
                  <p className="text-[10px] uppercase tracking-wider text-accent">
                    {p.tags.slice(0, 2).join(" · ")}
                  </p>
                )}
                <h3 className="mt-1.5 line-clamp-2 font-display text-base font-semibold text-ink group-hover:text-accent">
                  {p.title}
                </h3>
                {p.excerpt && (
                  <p className="mt-2 line-clamp-2 text-xs text-ink/60">{p.excerpt}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
