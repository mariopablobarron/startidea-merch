import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { publicRef } from "@/lib/internal-ref";
import { proxyImageUrl, absoluteProxyImageUrl } from "@/lib/proxy-image";
import { collectionPageJsonLd, breadcrumbJsonLd } from "@/lib/jsonld";
import { publicProductName } from "@/lib/product-name";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export const revalidate = 3600;

const EUR = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function collectDescendants(rootId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id);
    if (!childIds.length) break;
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.category.findFirst({ where: { slug }, select: { name: true } });
  if (!category) {
    return { title: "Categoría no encontrada", robots: { index: false, follow: true } };
  }
  const title = `${category.name} personalizable para empresas`;
  const description = `${category.name} con tu logo: precio competitivo, cotización en 24h y producción con impacto social en Centros Especiales de Empleo de Granada.`;
  const url = `${SITE_URL}/categorias/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "TodoMerchandising", locale: "es_ES" },
  };
}

export default async function CategoriaLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await prisma.category.findFirst({ where: { slug } });
  if (!category) notFound();

  const descendants = await collectDescendants(category.id);
  const categoryIds = [category.id, ...descendants];
  const where: Prisma.ProductWhereInput = {
    active: true,
    NOT: { override: { is: { hidden: true } } },
    categoryId: { in: categoryIds },
  };

  const [products, total, subCategories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ override: { featured: "desc" } }, { name: "asc" }],
      take: 24,
      select: {
        id: true,
        slug: true,
        name: true,
        internalRef: true,
        primaryImageUrl: true,
        fromPriceCents: true,
        category: { select: { name: true } },
        override: { select: { customName: true, customFromPriceCents: true, marginPct: true } },
      },
    }),
    prisma.product.count({ where }),
    // Subcategorías directas con al menos 1 producto activo (directo o en sus hijos).
    prisma.category.findMany({
      where: {
        parentId: category.id,
        OR: [
          { products: { some: { active: true } } },
          { children: { some: { products: { some: { active: true } } } } },
        ],
      },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);

  const breadcrumb = breadcrumbJsonLd([
    { name: "Inicio", url: "/" },
    { name: "Catálogo", url: "/catalogo" },
    { name: category.name, url: `/categorias/${slug}` },
  ]);
  const collection = collectionPageJsonLd({
    name: `${category.name} · TodoMerchandising`,
    description: `Productos de la categoría ${category.name}, personalizables con tu logo y producción con impacto social.`,
    url: `${SITE_URL}/categorias/${slug}`,
    items: products.map((p) => ({
      name: publicProductName(p.name, p.override?.customName),
      url: `${SITE_URL}/catalogo/${p.slug}`,
      image: absoluteProxyImageUrl(p.primaryImageUrl),
    })),
  });

  return (
    <>
      <JsonLd data={breadcrumb as never} />
      <JsonLd data={collection as never} />
      <Nav />
      <main className="bg-bone">
        <section className="border-b border-line bg-bone py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <nav className="mb-4 flex flex-wrap gap-1.5 text-[11px] uppercase tracking-[0.18em] text-ink/50">
              <Link href="/" className="hover:text-accent">Inicio</Link>
              <span>/</span>
              <Link href="/catalogo" className="hover:text-accent">Catálogo</Link>
              <span>/</span>
              <span className="text-ink/70">{category.name}</span>
            </nav>
            <h1 className="font-display text-section font-semibold text-ink">
              {category.name} personalizable
            </h1>
            <p className="mt-4 max-w-3xl text-base text-ink/70 lg:text-lg">
              {total.toLocaleString("es-ES")} {total === 1 ? "producto" : "productos"} de {category.name.toLowerCase()} para
              personalizar con el logo de tu empresa. Producción en Centros Especiales de Empleo y
              talleres locales de Granada — cada pedido genera impacto social. Cotización cerrada en 24h.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/catalogo?cat=${slug}`}
                className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone hover:bg-accent"
              >
                Ver todo con filtros →
              </Link>
              <Link
                href="/#cotizar"
                className="rounded-full border border-line bg-bone px-6 py-3 text-sm font-medium text-ink hover:border-accent"
              >
                Pedir cotización
              </Link>
            </div>

            {subCategories.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {subCategories.map((sc) => (
                  <Link
                    key={sc.slug}
                    href={`/categorias/${sc.slug}`}
                    className="rounded-full border border-line bg-bone-soft px-3 py-1 text-xs text-ink/70 transition hover:border-accent"
                  >
                    {sc.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="bg-bone py-10 lg:py-12">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            {products.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-line bg-bone-soft p-16 text-center">
                <p className="font-display text-2xl font-semibold text-ink">
                  Estamos sincronizando {category.name.toLowerCase()}.
                </p>
                <Link
                  href="/#cotizar"
                  className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone hover:bg-accent"
                >
                  Pedir cotización
                </Link>
              </div>
            ) : (
              <>
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {products.map((p) => {
                    const ov = p.override;
                    const name = publicProductName(p.name, ov?.customName);
                    const priceCents =
                      ov?.customFromPriceCents != null
                        ? ov.customFromPriceCents
                        : ov?.marginPct != null && p.fromPriceCents
                          ? Math.round((p.fromPriceCents * (100 + ov.marginPct)) / 100)
                          : p.fromPriceCents;
                    return (
                      <Link
                        key={p.id}
                        href={`/catalogo/${p.slug}`}
                        className="group flex flex-col rounded-3xl border border-line bg-bone-soft p-5 transition hover:border-accent/40"
                      >
                        <div className="relative aspect-square overflow-hidden rounded-2xl bg-bone">
                          {proxyImageUrl(p.primaryImageUrl) ? (
                            <Image
                              src={proxyImageUrl(p.primaryImageUrl)!}
                              alt={name}
                              fill
                              sizes="(max-width:768px) 50vw, 25vw"
                              className="object-contain p-4 transition group-hover:scale-105"
                              unoptimized
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-ink/30">Sin imagen</div>
                          )}
                        </div>
                        <h2 className="mt-5 line-clamp-2 font-display text-base font-semibold text-ink lg:text-lg">
                          {name}
                        </h2>
                        <p className="mt-1 flex flex-wrap items-baseline gap-2 text-[11px] uppercase tracking-wider text-ink/50">
                          {p.category?.name && <span>{p.category.name}</span>}
                          <span className="font-mono text-[10px] text-ink/40">
                            {publicRef({ id: p.id, internalRef: p.internalRef })}
                          </span>
                        </p>
                        {priceCents && priceCents > 0 ? (
                          <p className="mt-3 flex flex-wrap items-baseline gap-1 text-ink">
                            <span className="text-[11px] uppercase tracking-wider text-ink/50">Desde</span>
                            <span className="font-display text-xl font-semibold text-accent tabular-nums">
                              {EUR(priceCents)} €
                            </span>
                            <span className="text-[11px] text-ink/50">/ud</span>
                          </p>
                        ) : (
                          <p className="mt-3 text-xs text-ink/50">Precio bajo cotización</p>
                        )}
                        <span className="mt-3 text-xs font-medium text-accent">Personalizar →</span>
                      </Link>
                    );
                  })}
                </div>

                {total > products.length && (
                  <div className="mt-10 text-center">
                    <Link
                      href={`/catalogo?cat=${slug}`}
                      className="inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone hover:bg-accent"
                    >
                      Ver los {total.toLocaleString("es-ES")} productos de {category.name} →
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
