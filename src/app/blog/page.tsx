import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";
import { mergeMetadata, getPageSeo } from "@/lib/page-seo";

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

  return (
    <>
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
                        {p.heroUrl && (
                          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-bone-soft lg:h-44 lg:w-72 lg:flex-shrink-0">
                            <Image
                              src={p.heroUrl}
                              alt=""
                              fill
                              sizes="(max-width:1024px) 100vw, 288px"
                              className="object-cover transition group-hover:scale-105"
                              unoptimized
                            />
                          </div>
                        )}
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
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
