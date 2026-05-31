import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { prisma } from "@/lib/prisma";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/jsonld";
import { tagToSlug, slugToDisplayTag } from "@/lib/blog-tags";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

export const dynamic = "force-dynamic";

/**
 * Busca el tag original que matchea el slug dado y devuelve los posts.
 * Hace una sola query y filtra en memoria (los tags son listas cortas).
 */
async function getPostsByTagSlug(tagSlug: string) {
  try {
    const allPublished = await prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
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
      orderBy: { publishedAt: "desc" },
    });

    // Encontrar tag original (case-insensitive match)
    const originalTag = allPublished
      .flatMap((p) => p.tags)
      .find((t) => tagToSlug(t) === tagSlug);

    if (!originalTag) return { tag: null, posts: [] };

    const posts = allPublished.filter((p) =>
      p.tags.some((t) => tagToSlug(t) === tagSlug),
    );

    return { tag: originalTag, posts };
  } catch {
    return { tag: null, posts: [] };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: tagSlug } = await params;
  const { tag } = await getPostsByTagSlug(tagSlug);
  if (!tag) return { title: "Tag no encontrado" };
  const url = `${SITE_URL}/blog/tag/${tagSlug}`;
  const title = `Artículos sobre "${tag}" · Blog TodoMerchandising`;
  const description = `Todos los artículos del blog de TodoMerchandising etiquetados como "${tag}": guías prácticas, casos reales y datos del mercado del merchandising corporativo B2B.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "TodoMerchandising",
      locale: "es_ES",
      images: [
        { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: title },
      ],
    },
  };
}

export default async function BlogTagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: tagSlug } = await params;
  const { tag, posts } = await getPostsByTagSlug(tagSlug);
  if (!tag || posts.length === 0) notFound();

  const url = `${SITE_URL}/blog/tag/${tagSlug}`;

  const breadcrumbs = breadcrumbJsonLd([
    { name: "Inicio", url: "/" },
    { name: "Blog", url: "/blog" },
    { name: tag, url: `/blog/tag/${tagSlug}` },
  ]);

  const collection = collectionPageJsonLd({
    name: `Artículos sobre "${tag}" · Blog TodoMerchandising`,
    description: `Posts del blog etiquetados como "${tag}".`,
    url,
    items: posts.map((p) => ({
      name: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      image: p.heroUrl || `${SITE_URL}/blog/${p.slug}/opengraph-image`,
    })),
  });

  return (
    <>
      <JsonLd data={[breadcrumbs, collection] as never} />
      <Nav />
      <main>
        <section className="border-b border-line bg-bone py-14 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Tag
            </p>
            <h1 className="mt-3 font-display text-section font-semibold text-ink">
              {tag}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-ink/65 lg:text-lg">
              {posts.length} {posts.length === 1 ? "artículo" : "artículos"} sobre{" "}
              <strong className="text-ink">{tag}</strong> en el blog de
              TodoMerchandising. Casos reales, guías y datos del mercado del
              merchandising B2B en España.
            </p>
            <p className="mt-4 text-sm text-ink/55">
              <Link href="/blog" className="hover:text-accent">
                ← Ver todos los artículos
              </Link>
            </p>
          </div>
        </section>

        <section className="py-10 lg:py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <ul className="space-y-6">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="group block rounded-3xl border border-line bg-bone p-6 transition hover:border-accent/40 hover:shadow-lg lg:p-8"
                  >
                    <div className="flex flex-wrap gap-6 lg:flex-nowrap">
                      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-bone-soft lg:h-44 lg:w-72 lg:flex-shrink-0">
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
                          <p className="mt-2 line-clamp-3 text-sm text-ink/70">
                            {p.excerpt}
                          </p>
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
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
