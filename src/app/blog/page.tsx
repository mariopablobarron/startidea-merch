import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { prisma } from "@/lib/prisma";
import { mergeMetadata, getPageSeo } from "@/lib/page-seo";
import { collectionPageJsonLd } from "@/lib/jsonld";
import { tagToSlug } from "@/lib/blog-tags";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const BASE_METADATA: Metadata = {
  title: "Blog · TodoMerchandising",
  description:
    "Guías prácticas sobre merchandising corporativo: técnicas de marcaje, cantidades mínimas, plazos, sostenibilidad y casos reales B2B.",
  alternates: { canonical: "https://merchandising.hubstartidea.es/blog" },
};

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPageSeo("/blog");
  return mergeMetadata(BASE_METADATA, seo);
}

// Build no tiene DATABASE_URL — runtime sí. force-dynamic + try/catch.
export const dynamic = "force-dynamic";

async function loadPosts() {
  try {
    return await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 30,
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

export default async function BlogIndexPage() {
  const posts = await loadPosts();

  const collectionSchema =
    posts.length > 0
      ? collectionPageJsonLd({
          name: "Blog · TodoMerchandising",
          description:
            "Guías prácticas sobre merchandising corporativo: técnicas de marcaje, cantidades mínimas, plazos, sostenibilidad y casos reales B2B.",
          url: `${SITE_URL}/blog`,
          items: posts.map((p) => ({
            name: p.title,
            url: `${SITE_URL}/blog/${p.slug}`,
            image: p.heroUrl || `${SITE_URL}/blog/${p.slug}/opengraph-image`,
          })),
        })
      : null;

  return (
    <>
      {collectionSchema && <JsonLd data={collectionSchema as never} />}
      <Nav />
      <main>
        <section className="border-b border-line bg-bone py-14 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Blog
            </p>
            <h1 className="mt-3 font-display text-section font-semibold text-ink">
              Guías y casos reales de merchandising corporativo
            </h1>
            <p className="mt-4 max-w-2xl text-base text-ink/65 lg:text-lg">
              Lo que aprendemos produciendo pedidos para empresas, eventos y campañas:
              técnicas, cantidades, plazos, impacto. Sin fluff, con cifras.
            </p>
          </div>
        </section>

        <section className="py-10 lg:py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            {posts.length === 0 ? (
              <p className="rounded-2xl border border-line bg-bone p-10 text-center text-sm text-ink/60">
                Pronto añadiremos los primeros artículos.
              </p>
            ) : (
              <ul className="space-y-6">
                {posts.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/blog/${p.slug}`}
                      className="group block rounded-3xl border border-line bg-bone p-6 transition hover:border-accent/40 hover:shadow-lg lg:p-8"
                    >
                      <div className="flex flex-wrap gap-6 lg:flex-nowrap">
                        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-bone-soft lg:h-44 lg:w-72 lg:flex-shrink-0">
                          {/* Si no hay heroUrl en BD, usa el OG dinámico del post. */}
                          <Image
                            src={p.heroUrl || `/blog/${p.slug}/opengraph-image`}
                            alt=""
                            fill
                            sizes="(max-width:1024px) 100vw, 288px"
                            className="object-cover transition group-hover:scale-105"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          {p.tags.length > 0 && (
                            <p className="text-[11px] uppercase tracking-wider text-accent">
                              {p.tags.slice(0, 3).join(" · ")}
                            </p>
                          )}
                          <h2 className="mt-2 font-display text-2xl font-semibold text-ink group-hover:text-accent">
                            {p.title}
                          </h2>
                          {p.excerpt && (
                            <p className="mt-2 line-clamp-3 text-sm text-ink/70">{p.excerpt}</p>
                          )}
                          <p className="mt-3 text-[11px] text-ink/40">
                            {p.publishedAt &&
                              new Date(p.publishedAt).toLocaleDateString("es-ES", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              })}
                            {p.author && ` · ${p.author}`}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Tag cloud — landing por tag (clúster temático para SEO) */}
            {(() => {
              const tagCounts = new Map<string, number>();
              posts.forEach((p) =>
                p.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)),
              );
              const tags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
              if (tags.length === 0) return null;
              return (
                <div className="mt-16 border-t border-line pt-10">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                    Explora por tema
                  </p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {tags.map(([tag, count]) => (
                      <li key={tag}>
                        <Link
                          href={`/blog/tag/${tagToSlug(tag)}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bone px-3 py-1.5 text-sm text-ink/70 transition hover:border-accent/40 hover:text-accent"
                        >
                          {tag}
                          <span className="text-xs text-ink/40">({count})</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
