import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { BannerSlot } from "@/components/BannerSlot";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { mergeMetadata, getPageSeo } from "@/lib/page-seo";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { loadActivePromotions, getBadgeText } from "@/lib/promotions";
import { displayFromPrice } from "@/lib/product-pricing";
import { publicProductName } from "@/lib/product-name";

const BASE_METADATA: Metadata = {
  title: "Promociones · TodoMerchandising",
  description:
    "Productos destacados, novedades y ofertas activas en merchandising corporativo personalizable. Precio al instante en cada ficha.",
  alternates: { canonical: "https://merchandising.startidea.es/promociones" },
};

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPageSeo("/promociones");
  return mergeMetadata(BASE_METADATA, seo);
}

export const dynamic = "force-dynamic";

const EUR = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2 });

/**
 * Página /promociones — agrupa todos los productos:
 *   - destacados (override.featured = true)
 *   - con tags de marketing tipo "promo", "oferta", "novedad"
 *
 * Es el equivalente al "Promociones" del nav superior de todomerch.com.
 * Genera URL única para campañas y permite linkar desde emails/banners.
 */
export default async function PromocionesPage() {
  // Promociones programadas y vigentes (Promotion model) — se pintan arriba
  // del todo como banners con CTA. Sólo las marcadas `displayInList`.
  const allActive = await loadActivePromotions();
  const activePromos = allActive.filter((p) => p.displayInList);

  const [products, categoriesForPromo, productsForPromo] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        NOT: { override: { is: { hidden: true } } },
        OR: [
          { override: { is: { featured: true } } },
          { override: { is: { marketingTags: { hasSome: ["promo", "oferta", "novedad", "best-seller"] } } } },
        ],
      },
      orderBy: [{ override: { featured: "desc" } }, { name: "asc" }],
      take: 60,
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        primaryImageUrl: true,
        fromPriceCents: true,
        categoryId: true,
        category: { select: { name: true } },
        override: {
          select: {
            customName: true,
            customFromPriceCents: true,
            marginPct: true,
            featured: true,
            marketingTags: true,
          },
        },
      },
    }),
    // Lookup nombres para los banners de promo (CATEGORY scope)
    activePromos.some((p) => p.scope === "CATEGORY")
      ? prisma.category.findMany({
          where: {
            id: {
              in: activePromos
                .filter((p) => p.scope === "CATEGORY")
                .flatMap((p) => p.targetIds),
            },
          },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([]),
    activePromos.some((p) => p.scope === "PRODUCT_LIST")
      ? prisma.product.findMany({
          where: {
            id: {
              in: activePromos
                .filter((p) => p.scope === "PRODUCT_LIST")
                .flatMap((p) => p.targetIds),
            },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            override: { select: { customName: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const catLookup = Object.fromEntries(categoriesForPromo.map((c) => [c.id, c]));
  const prodLookup = Object.fromEntries(productsForPromo.map((p) => [p.id, p]));

  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Inicio", url: "/" }, { name: "Promociones", url: "/promociones" }]) as never} />
      <Nav />
      <main className="bg-bone">
        <section className="border-b border-line bg-gradient-to-br from-accent/10 via-bone to-bone py-14 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Promociones
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-section font-semibold text-ink">
              {activePromos.length > 0
                ? "Promociones activas, novedades y best-sellers"
                : "Productos destacados, novedades y ofertas"}
            </h1>
            <p className="mt-4 max-w-3xl text-base text-ink/70 lg:text-lg">
              {activePromos.length > 0
                ? `${activePromos.length} ${activePromos.length === 1 ? "promoción vigente" : "promociones vigentes"} con descuento automático en card y carrito. Más productos seleccionados abajo.`
                : products.length > 0
                  ? `${products.length} productos seleccionados por nuestro equipo: best-sellers, novedades y ofertas activas.`
                  : "Pronto añadiremos promociones destacadas. Mientras, explora todo el catálogo."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/catalogo"
                className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
              >
                Ver catálogo completo →
              </Link>
              <Link
                href="/#cotizar"
                className="rounded-full border border-line bg-bone-soft px-6 py-3 text-sm font-medium text-ink hover:border-accent"
              >
                Pedir cotización
              </Link>
            </div>
          </div>
        </section>

        <BannerSlot slot="HOME_TOP" />

        {/* Banners de promociones programadas (Promotion model) */}
        {activePromos.length > 0 && (
          <section className="border-b border-line bg-bone py-10 lg:py-14">
            <div className="mx-auto max-w-8xl px-6 lg:px-10">
              <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                — Promociones activas
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {activePromos.map((p) => {
                  const targetNames =
                    p.scope === "ALL"
                      ? ["Todo el catálogo"]
                      : p.scope === "CATEGORY"
                        ? p.targetIds.map((id) => catLookup[id]?.name).filter(Boolean) as string[]
                        : p.scope === "PRODUCT_LIST"
                          ? p.targetIds
                              .map((id) => prodLookup[id])
                              .filter((target): target is NonNullable<typeof target> => Boolean(target))
                              .map((target) =>
                                publicProductName(target.name, target.override?.customName),
                              )
                          : p.targetIds;
                  const ctaLink =
                    p.scope === "CATEGORY" && p.targetIds[0] && catLookup[p.targetIds[0]]
                      ? `/catalogo?cat=${catLookup[p.targetIds[0]]!.slug}`
                      : p.scope === "PRODUCT_LIST" && p.targetIds[0] && prodLookup[p.targetIds[0]]
                        ? `/catalogo/${prodLookup[p.targetIds[0]]!.slug}`
                        : "/catalogo";
                  const ends = p.endsAt
                    ? new Date(p.endsAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })
                    : null;
                  return (
                    <Link
                      key={p.id}
                      href={ctaLink}
                      className="group flex items-center justify-between gap-6 rounded-3xl border border-line bg-bone-soft p-6 shadow-sm transition hover:border-accent/40 hover:shadow-md"
                    >
                      <div className="flex-1">
                        <span
                          className="inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-bone shadow"
                          style={{ background: p.badgeColor || "#E63E73" }}
                        >
                          {getBadgeText(p)}
                        </span>
                        <h3 className="mt-3 font-display text-xl font-semibold text-ink lg:text-2xl">
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-ink/70">{p.description}</p>
                        )}
                        <p className="mt-2 text-[11px] uppercase tracking-wider text-ink/55">
                          {targetNames.slice(0, 3).join(" · ")}
                          {targetNames.length > 3 && ` · +${targetNames.length - 3}`}
                          {ends && <span className="ml-2 text-accent">· hasta {ends}</span>}
                        </p>
                      </div>
                      <span className="shrink-0 self-end text-sm font-medium text-accent group-hover:text-accent-dark">
                        Ver productos →
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {products.length > 0 && (
          <section className="py-10 lg:py-14">
            <div className="mx-auto max-w-8xl px-6 lg:px-10">
              <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => {
                  const ov = p.override;
                  const displayName = publicProductName(p.name, ov?.customName);
                  // Precio "desde" cliente (neto → margen/override → PERCENT).
                  // Misma fuente que ficha, catálogo y carrito.
                  const priceInfo = displayFromPrice(
                    {
                      id: p.id,
                      name: p.name,
                      brand: p.brand,
                      categoryId: p.categoryId,
                      fromPriceCents: p.fromPriceCents,
                    },
                    ov
                      ? {
                          customFromPriceCents: ov.customFromPriceCents,
                          marginPct: ov.marginPct,
                          marketingTags: ov.marketingTags,
                        }
                      : null,
                    allActive,
                  );
                  const basePriceCents = priceInfo.originalCents;
                  const displayPriceCents = priceInfo.finalCents;
                  const hasPromo = priceInfo.hasPromo;
                  const badgePromo = priceInfo.badgePromo;
                  const tags = ov?.marketingTags ?? [];

                  return (
                    <Link
                      key={p.id}
                      href={`/catalogo/${p.slug}`}
                      className="group relative flex flex-col rounded-3xl border border-line bg-bone-soft p-5 transition hover:border-accent/40"
                    >
                      {(ov?.featured || tags.length > 0 || hasPromo) && (
                        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1">
                          {hasPromo && badgePromo && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone shadow"
                              style={{ background: badgePromo.badgeColor || "#E63E73" }}
                            >
                              {getBadgeText(badgePromo)}
                            </span>
                          )}
                          {ov?.featured && (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone shadow">
                              ★ Destacado
                            </span>
                          )}
                          {tags.slice(0, 2).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-social/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone shadow"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-bone">
                        {proxyImageUrl(p.primaryImageUrl) ? (
                          <Image
                            src={proxyImageUrl(p.primaryImageUrl)!}
                            alt={displayName}
                            fill
                            sizes="(max-width:768px) 50vw, 25vw"
                            className="object-contain p-4 transition group-hover:scale-105"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-ink/30">
                            Sin imagen
                          </div>
                        )}
                      </div>
                      <h3 className="mt-5 line-clamp-2 font-display text-base font-semibold text-ink lg:text-lg">
                        {displayName}
                      </h3>
                      {p.category?.name && (
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-ink/50">
                          {p.category.name}
                        </p>
                      )}
                      {displayPriceCents && displayPriceCents > 0 ? (
                        <p className="mt-3 flex flex-wrap items-baseline gap-1 text-ink">
                          <span className="text-[11px] uppercase tracking-wider text-ink/50">
                            Desde
                          </span>
                          <span className="font-display text-xl font-semibold text-accent tabular-nums">
                            {EUR.format(displayPriceCents / 100)} €
                          </span>
                          {hasPromo && basePriceCents && basePriceCents > displayPriceCents && (
                            <span className="font-mono text-[11px] tabular-nums text-ink/40 line-through">
                              {EUR.format(basePriceCents / 100)}€
                            </span>
                          )}
                          <span className="text-[11px] text-ink/50">/ud</span>
                        </p>
                      ) : (
                        <p className="mt-3 text-xs text-ink/50">Precio bajo cotización</p>
                      )}
                      <div className="mt-3 flex items-center justify-end text-xs">
                        <span className="font-medium text-accent">Personalizar →</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
