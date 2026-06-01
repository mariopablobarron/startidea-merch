import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { RelatedPosts } from "@/components/RelatedPosts";
import { NewsletterForm } from "@/components/NewsletterForm";
import { prisma } from "@/lib/prisma";
import { mdToHtml, buildBlogSchema } from "@/lib/blog-generator";
import { injectInternalLinks, type LinkableEntity } from "@/lib/blog-internal-links";
import { SECTORS } from "@/lib/sectors";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

// force-dynamic para evitar pre-render en build sin DATABASE_URL.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({
    where: { slug },
    select: {
      title: true,
      metaTitle: true,
      metaDescription: true,
      excerpt: true,
      heroUrl: true,
      publishedAt: true,
      tags: true,
    },
  });
  if (!post) return { title: "Artículo no encontrado" };
  const postUrl = `https://merchandising.hubstartidea.es/blog/${slug}`;
  const title = post.metaTitle || post.title;
  const description = post.metaDescription || post.excerpt?.slice(0, 160) || `Artículo sobre ${post.tags[0] || "merchandising"}`;
  return {
    title,
    description,
    alternates: { canonical: postUrl },
    openGraph: {
      type: "article",
      url: postUrl,
      title,
      description,
      siteName: "TodoMerchandising",
      locale: "es_ES",
      // Si no hay heroUrl en BD, usa el OG dinámico del post como fallback
      // — siempre se exporta og:image (clave para previews en RRSS).
      images: [
        {
          url: post.heroUrl || `${postUrl}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      publishedTime: post.publishedAt?.toISOString(),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [post.heroUrl || `${postUrl}/opengraph-image`],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") notFound();

  // 1. Markdown → HTML
  let html = mdToHtml(post.bodyMd);

  // 2. Internal linking automático: enlazar menciones a sectores y categorías.
  // Solo trae entidades simples (sectores y top categorías) — no productos
  // específicos (sería ruido + matches falsos para nombres genéricos).
  try {
    const topCategories = await prisma.category.findMany({
      where: { level: 0 },
      select: { name: true, slug: true },
      take: 30,
    });
    const entities: LinkableEntity[] = [
      ...SECTORS.map((s) => ({
        name: s.title,
        url: `/sectores/${s.slug}`,
      })),
      ...topCategories.map((c) => ({
        name: c.name,
        url: `/catalogo?cat=${c.slug}`,
      })),
    ];
    html = injectInternalLinks(html, entities, { maxPerEntity: 1, minLength: 5 });
  } catch {
    // Si falla la BD, seguimos con el HTML sin linkar — no rompemos el post.
  }

  const faq = (post.schemaJson as { faq?: Array<{ q: string; a: string }> } | null)?.faq;
  const schema = buildBlogSchema(
    {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      heroUrl: post.heroUrl,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: post.author,
      tags: post.tags,
      bodyMd: post.bodyMd,
      faq,
    },
    SITE_URL,
  );

  return (
    <>
      <JsonLd data={schema as never} />
      <Nav />
      <main>
        <article className="mx-auto max-w-3xl px-6 py-10 lg:py-16 lg:px-8">
          <header>
            <nav className="text-xs text-ink/50">
              <Link href="/blog" className="hover:text-accent">
                ← Blog
              </Link>
            </nav>
            {post.tags.length > 0 && (
              <p className="mt-4 flex flex-wrap gap-1.5 text-[11px] uppercase tracking-wider text-accent">
                {post.tags.map((t) => (
                  <span key={t} className="rounded-full bg-accent/10 px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </p>
            )}
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-ink lg:text-5xl">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-5 max-w-2xl text-lg text-ink/70 lg:text-xl">
                {post.excerpt}
              </p>
            )}
            <p className="mt-5 text-xs text-ink/40">
              {post.publishedAt &&
                new Date(post.publishedAt).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              {post.author && ` · ${post.author}`}
              {post.keywordTarget && ` · sobre ${post.keywordTarget}`}
            </p>
            {post.heroUrl && (
              <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-3xl border border-line bg-bone-soft">
                <Image
                  src={post.heroUrl}
                  alt=""
                  fill
                  sizes="(max-width:1024px) 100vw, 768px"
                  className="object-cover"
                  priority
                  unoptimized
                />
              </div>
            )}
          </header>

          <div
            className="prose prose-lg mt-10 max-w-none prose-headings:font-display prose-headings:text-ink prose-h2:mt-12 prose-h3:mt-8 prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-strong:text-ink"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Newsletter signup — momento óptimo de conversión: justo después
              de que el usuario haya leído todo el contenido. Source con slug
              para tracking por post en /admin/marketing/newsletter. */}
          <aside className="mt-12 rounded-3xl border border-accent/20 bg-accent-wash/40 p-6 lg:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent-deep">
              Recibe las próximas guías
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink lg:text-3xl">
              Una guía al mes en tu inbox
            </h2>
            <p className="mt-3 text-sm text-ink/70 lg:text-base">
              Lo que aprendemos produciendo merchandising B2B: técnicas, plazos,
              cifras reales del mercado español, casos concretos. Sin spam. Solo
              cuando tenemos algo que aportar.
            </p>
            <div className="mt-5">
              <NewsletterForm source={`blog-${post.slug}`} />
            </div>
          </aside>

          <RelatedPosts currentSlug={post.slug} currentTags={post.tags} />

          <aside className="mt-12 rounded-3xl border border-line bg-bone-soft p-6 lg:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              ¿Lo aplicas a tu próximo pedido?
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
              Precio al instante
            </h2>
            <p className="mt-3 text-sm text-ink/70">
              Si tu campaña encaja con lo que acabas de leer, entra al catálogo,
              configura cantidad y marcaje, y verás precio al instante.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/catalogo"
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone hover:bg-accent-dark"
              >
                Ver catálogo →
              </Link>
              <Link
                href="/#cotizar"
                className="rounded-full border border-line bg-bone px-5 py-2.5 text-sm font-medium text-ink hover:border-accent"
              >
                Pedir cotización
              </Link>
            </div>
          </aside>
        </article>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
