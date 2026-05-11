import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { BannerSlot } from "@/components/BannerSlot";
import { prisma } from "@/lib/prisma";
import { mergeMetadata, getPageSeo } from "@/lib/page-seo";

const BASE_METADATA: Metadata = {
  title: "Promociones · TodoMerchandising",
  description:
    "Productos destacados, novedades y ofertas activas en merchandising corporativo personalizable. Cotización en 24h.",
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
  const products = await prisma.product.findMany({
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
  });

  return (
    <>
      <Nav />
      <main className="bg-bone">
        <section className="border-b border-line bg-gradient-to-br from-accent/10 via-bone to-bone py-14 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="text-sm font-medium uppercase tracking-wider text-accent">
              Promociones
            </p>
            <h1 className="mt-3 max-w-3xl font-display text-section font-semibold text-ink">
              Productos destacados, novedades y ofertas
            </h1>
            <p className="mt-4 max-w-3xl text-base text-ink/70 lg:text-lg">
              {products.length > 0
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

        {products.length > 0 && (
          <section className="py-10 lg:py-14">
            <div className="mx-auto max-w-8xl px-6 lg:px-10">
              <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => {
                  const ov = p.override;
                  const displayName = ov?.customName || p.name;
                  const displayPriceCents =
                    ov?.customFromPriceCents != null
                      ? ov.customFromPriceCents
                      : ov?.marginPct != null && p.fromPriceCents
                        ? Math.round((p.fromPriceCents * (100 + ov.marginPct)) / 100)
                        : p.fromPriceCents;
                  const tags = ov?.marketingTags ?? [];

                  return (
                    <Link
                      key={p.id}
                      href={`/catalogo/${p.slug}`}
                      className="group relative flex flex-col rounded-3xl border border-line bg-bone-soft p-5 transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
                    >
                      {(ov?.featured || tags.length > 0) && (
                        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1">
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
                        {p.primaryImageUrl ? (
                          <Image
                            src={p.primaryImageUrl}
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
                        <p className="mt-3 flex items-baseline gap-1 text-ink">
                          <span className="text-[11px] uppercase tracking-wider text-ink/50">
                            Desde
                          </span>
                          <span className="font-display text-xl font-semibold text-accent tabular-nums">
                            {EUR.format(displayPriceCents / 100)} €
                          </span>
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
