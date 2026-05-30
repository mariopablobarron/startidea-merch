import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";

/**
 * Server component que muestra los 3 últimos posts del blog en el home.
 * Lee directo Prisma (no API) — el home ya es force-dynamic.
 * Si no hay posts publicados o DB falla, no renderiza nada (graceful).
 */
async function loadLatestPosts() {
  try {
    return await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
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
        author: true,
      },
    });
  } catch {
    return [];
  }
}

export async function LatestPosts() {
  const posts = await loadLatestPosts();

  if (posts.length === 0) return null;

  return (
    <section className="bg-bone py-20 lg:py-28">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Desde el blog
            </p>
            <h2 className="mt-3 font-display text-section font-semibold text-ink">
              Guías y casos reales,<br />
              <span className="text-ink/55">sin fluff y con cifras.</span>
            </h2>
          </div>
          <Link
            href="/blog"
            className="text-sm font-medium text-accent transition hover:text-accent/80"
          >
            Ver todos los artículos →
          </Link>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/blog/${p.slug}`}
                className="group block h-full overflow-hidden rounded-3xl border border-line bg-bone-soft transition hover:border-accent/40 hover:shadow-lg"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-bone">
                  {/* Si no hay heroUrl en BD, usa el OG dinámico del post como
                      fallback — siempre hay imagen (nunca placeholder gradient). */}
                  <Image
                    src={p.heroUrl || `/blog/${p.slug}/opengraph-image`}
                    alt=""
                    fill
                    sizes="(max-width:768px) 100vw, (max-width:1024px) 50vw, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                    unoptimized
                  />
                </div>
                <div className="p-6">
                  {p.tags.length > 0 && (
                    <p className="text-[10px] uppercase tracking-wider text-accent">
                      {p.tags.slice(0, 2).join(" · ")}
                    </p>
                  )}
                  <h3 className="mt-2 line-clamp-2 font-display text-lg font-semibold text-ink group-hover:text-accent">
                    {p.title}
                  </h3>
                  {p.excerpt && (
                    <p className="mt-3 line-clamp-3 text-sm text-ink/65">{p.excerpt}</p>
                  )}
                  <p className="mt-4 text-[11px] text-ink/40">
                    {p.publishedAt &&
                      new Date(p.publishedAt).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    {p.author && ` · ${p.author}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
