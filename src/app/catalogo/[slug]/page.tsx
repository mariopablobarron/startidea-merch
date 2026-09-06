import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { RelatedProducts } from "@/components/RelatedProducts";
import { DeliveryEstimate } from "@/components/DeliveryEstimate";
import { prisma } from "@/lib/prisma";
import { ProductOrderForm } from "@/components/ProductOrderForm";
import { ProductColorProvider } from "@/components/product-color-context";
import { ProductGallery } from "@/components/ProductGallery";
import { groupColorOptions } from "@/lib/variant-grouping";
import { normalizeLegacyCifraVariant } from "@/lib/suppliers/cifra-variant";
import { CompareToggle } from "@/components/CompareToggle";
// ProductOrderForm fusiona PriceTierTable + QuantityConfigurator + MarkingCalculator
// en un único flujo: cantidad → toggle marcaje → opciones → total + CTAs.
import { MockupGenerator } from "@/components/MockupGenerator";
import { WhatsAppCta } from "@/components/WhatsAppCta";
import { type PriceTier } from "@/lib/pricing";
import { loadActivePromotions, getBadgeText } from "@/lib/promotions";
import { computeClientPricing } from "@/lib/product-pricing";
import { fromPriceWithMarking } from "@/lib/product-from-price-with-marking";
import { publicRef } from "@/lib/internal-ref";
import { FavoriteHeart } from "@/components/portal/FavoriteHeart";
import { AskDiego } from "@/components/AskDiego";
import { publicBrand } from "@/lib/brand-filter";
import { positionOptionLabel } from "@/lib/marking-position-label";
import { proxyImageUrl, absoluteProxyImageUrl } from "@/lib/proxy-image";
import { JsonLd } from "@/components/JsonLd";
import { productJsonLd, breadcrumbJsonLd } from "@/lib/jsonld";
import { ProductViewTracker } from "@/components/ProductViewTracker";
import { legacyHtmlToText, publicProductName } from "@/lib/product-name";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await prisma.product.findUnique({
    where: { slug },
    select: {
      name: true,
      brand: true,
      shortDescription: true,
      primaryImageUrl: true,
      override: { select: { customName: true, metaTitle: true, metaDescription: true } },
    },
  });
  if (!p) return { title: "Producto no encontrado" };
  const name = publicProductName(p.name, p.override?.customName);
  const visibleBrand = publicBrand(p.brand);
  const customMetaTitle = legacyHtmlToText(p.override?.metaTitle);
  const title = customMetaTitle || `${name}${visibleBrand ? ` · ${visibleBrand}` : ""}`;
  const customMetaDescription = legacyHtmlToText(p.override?.metaDescription);
  const supplierDescription = legacyHtmlToText(p.shortDescription).slice(0, 160);
  const description =
    customMetaDescription ||
    supplierDescription ||
    `${name} personalizable con tu logo.`;
  const productUrl = `https://merchandising.startidea.es/catalogo/${slug}`;
  const productImg = absoluteProxyImageUrl(p.primaryImageUrl);
  return {
    title,
    description,
    alternates: { canonical: productUrl },
    openGraph: {
      type: "website",
      url: productUrl,
      title,
      description,
      siteName: "TodoMerchandising",
      locale: "es_ES",
      images: productImg ? [{ url: productImg, width: 1200, height: 630, alt: name }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: productImg ? [productImg] : [],
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: { include: { parent: { include: { parent: true } } } },
      variants: {
        orderBy: { sku: "asc" },
        // `select` explícito, NO `include`: la ficha es pública y `include`
        // arrastraba `images[]` y `variantId`, que siguen conteniendo datos
        // crudos del proveedor (55k URLs de su CDN). Hoy no se serializan,
        // pero un futuro spread los expondría de golpe. Ver la fuga del
        // 2026-07-20 en /api/recommend.
        select: {
          id: true,
          sku: true,
          colorName: true,
          colorGroup: true,
          colorHex: true,
          size: true,
          stockQty: true,
          imageUrl: true,
          priceTiers: { orderBy: { minQty: "asc" } },
        },
      },
      positions: {
        include: { techniques: { include: { technique: true } } },
      },
      override: true,
    },
  });
  // Slug antiguo: redirect permanente 308 de Next al slug actual.
  if (!product) {
    const redirectEntry = await prisma.productSlugRedirect.findUnique({
      where: { oldSlug: slug },
      select: { product: { select: { slug: true } } },
    });
    if (redirectEntry?.product?.slug) {
      permanentRedirect(`/catalogo/${redirectEntry.product.slug}`);
    }
    // Categoría legacy: el sitio anterior servía las categorías bajo
    // /catalogo/<slug> (a veces con sufijo numérico: "sudaderas-231",
    // "deportes-ocio--175"). Hoy viven en /categorias/<slug> y estas URLs
    // acumulan cientos de miles de 404 rastreados (Ahrefs, 2026-08-22).
    const legacyCategorySlug = slug.replace(/-+\d+$/, "");
    const category =
      (await prisma.category.findFirst({
        where: { slug },
        select: { slug: true },
      })) ??
      (legacyCategorySlug !== slug
        ? await prisma.category.findFirst({
            where: { slug: legacyCategorySlug },
            select: { slug: true },
          })
        : null);
    if (category) {
      permanentRedirect(`/categorias/${category.slug}`);
    }
    notFound();
  }
  // Si admin lo marcó hidden, no se muestra al público
  if (product.override?.hidden) notFound();

  // Aplicar overrides admin (si existen) sobre los datos base
  const ov = product.override;
  const displayName = publicProductName(product.name, ov?.customName);
  const displayDescription = legacyHtmlToText(ov?.customDescription || product.longDescription);
  const displayShortDescription = legacyHtmlToText(
    ov?.customDescription || product.enhancedShortDescription || product.shortDescription,
  );
  const displayMaterial = legacyHtmlToText(product.material);
  const extraImages = ov?.extraImages ?? [];
  const marketingTags = ov?.marketingTags ?? [];
  // Referencia pública Startidea — nunca exponer supplierRef al cliente
  const displayRef = publicRef(product);

  const totalStock = product.variants.reduce((sum, v) => sum + v.stockQty, 0);
  // Agrupamos TODAS las variantes. Las filas sin color forman una opción
  // neutra para que productos solo-talla o de variante única conserven su SKU.
  // Las imágenes se pasan por proxyImageUrl al ser cliente el receptor.
  const publicVariants = product.variants.map((variant) =>
    product.supplier === "cifra"
      ? normalizeLegacyCifraVariant(variant, product.supplierRef)
      : variant,
  );
  const colorOptions = groupColorOptions(publicVariants).map((o) => ({
    ...o,
    imageUrl: proxyImageUrl(o.imageUrl),
  }));

  // Tabla de tallas — agrupar variantes únicas por size si existe
  const sizes = Array.from(
    new Set(colorOptions.flatMap((option) => option.sizes.map((size) => size.size))),
  ).sort(naturalSizeOrder);

  // Precio cliente — FUENTE ÚNICA (coste neto → margen/override → promo).
  // El mismo helper lo usa /api/quote/calculate, así el precio base del producto
  // es idéntico con o sin marcaje, y en card / ficha / carrito.
  // Tiers de proveedor (NETOS) de la primera variante que los tenga; el helper
  // los descarta si el admin fijó precio (customFromPriceCents / marginPct).
  const variantWithTiers = product.variants.find((v) => v.priceTiers.length > 0);
  const providerNetTiers = variantWithTiers?.priceTiers.map((t) => ({
    minQty: t.minQty,
    unitPriceCents: t.unitPriceCents,
  }));

  const activePromos = await loadActivePromotions();
  const pricing = computeClientPricing({
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      categoryId: product.categoryId,
      fromPriceCents: product.fromPriceCents,
      category: product.category ? { name: product.category.name } : null,
    },
    override: ov
      ? {
          customFromPriceCents: ov.customFromPriceCents,
          marginPct: ov.marginPct,
          marketingTags: ov.marketingTags,
        }
      : null,
    providerNetTiers,
    activePromos,
  });

  const activePromo = pricing.bannerPromo;
  const promoBadgeText = activePromo ? getBadgeText(activePromo) : null;
  const promoBadgeColor = activePromo?.badgeColor || "#C41D51";
  const originalFromPriceCents = pricing.originalFromPriceCents;
  const finalFromPriceCents = pricing.fromPriceCents;
  const tiers: PriceTier[] | undefined = pricing.clientTiers;
  const baseCents = pricing.baseCentsForEstimate;

  // El «desde» de arriba es el producto SIN personalizar. Éste es el mismo
  // producto marcado a una tinta, calculado con el pipeline del carrito para
  // que la ficha no prometa un precio distinto del que se cobra. `null` si no
  // hay tarifa fiable: mejor no enseñar nada que enseñar un número inventado.
  const conMarcaje = await fromPriceWithMarking({
    productSlug: product.slug,
    tiers,
    positions: product.positions,
    activePromos,
  });

  const breadcrumbs: Array<{ name: string; href?: string }> = [{ name: "Catálogo", href: "/catalogo" }];
  if (product.category?.parent?.parent) {
    breadcrumbs.push({
      name: product.category.parent.parent.name,
      href: `/catalogo?cat=${product.category.parent.parent.slug}`,
    });
  }
  if (product.category?.parent) {
    breadcrumbs.push({
      name: product.category.parent.name,
      href: `/catalogo?cat=${product.category.parent.slug}`,
    });
  }
  if (product.category) {
    breadcrumbs.push({ name: product.category.name });
  }
  breadcrumbs.push({ name: displayName });

  // Schema.org Product + BreadcrumbList para rich snippets SEO
  const minPriceCents = tiers
    ? Math.min(...tiers.map((t) => t.unitPriceCents))
    : baseCents ?? null;
  const productSchema = productJsonLd({
    slug: product.slug,
    name: displayName,
    description: displayDescription || displayShortDescription,
    // JSON-LD usa siempre URL absoluta vía /api/m/<hash> — nunca CDN proveedor
    primaryImageUrl: absoluteProxyImageUrl(product.primaryImageUrl),
    productRef: displayRef, // Ref pública Startidea (nunca supplierRef)
    priceCents: minPriceCents,
    category: product.category?.name ?? null,
  });
  const breadcrumbSchema = breadcrumbJsonLd(
    breadcrumbs
      .filter((b) => b.href)
      .map((b) => ({ name: b.name, url: b.href! }))
      .concat([{ name: displayName, url: `/catalogo/${product.slug}` }]),
  );

  return (
    <>
      <Nav />
      <ProductViewTracker productId={product.id} />
      <JsonLd data={productSchema} />
      <JsonLd data={breadcrumbSchema} />
      <main className="bg-bone">
        <div className="mx-auto max-w-8xl px-6 pt-10 lg:px-10">
          <nav className="flex flex-wrap gap-1.5 text-xs text-ink/60">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {b.href ? (
                  <Link href={b.href} className="hover:text-accent">
                    {b.name}
                  </Link>
                ) : (
                  <span className="text-ink">{b.name}</span>
                )}
                {i < breadcrumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </nav>
        </div>

        <section className="py-10 lg:py-14">
          <ProductColorProvider>
          <div className="mx-auto grid max-w-8xl gap-x-12 px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:px-10">
              {/* El DOM sigue el recorrido móvil y semántico real:
                  galería → H1/precio/configurador → contenido técnico.
                  En escritorio, las áreas explícitas mantienen galería y ficha
                  técnica a la izquierda y el configurador sticky a la derecha. */}
              <div data-product-region="gallery" className="lg:col-start-1 lg:row-start-1">
                <ProductGallery
                  primaryImageUrl={proxyImageUrl(product.primaryImageUrl)}
                  productName={displayName}
                  colorOptions={colorOptions}
                />
              </div>

              <section
                aria-labelledby="product-title"
                data-product-region="purchase"
                className="mt-12 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-start"
              >
                {/* Banda de promoción activa: aparece encima de la marca y muy visible */}
                {activePromo && (
                  <div
                    className="-mt-2 mb-4 rounded-xl px-3 py-2 text-bone shadow-sm"
                    style={{ background: promoBadgeColor }}
                  >
                    <p className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-bone/25 px-2 py-0.5 font-display text-[11px] font-bold tracking-wider">
                        {promoBadgeText}
                      </span>
                      <span className="font-medium">{activePromo.name}</span>
                      {activePromo.endsAt && (
                        <span className="ml-auto text-[10px] opacity-90">
                          hasta{" "}
                          {new Date(activePromo.endsAt).toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {publicBrand(product.brand) && (
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                    {publicBrand(product.brand)}
                  </p>
                )}
                <div className="mt-3 flex items-start justify-between gap-3">
                  <h1 id="product-title" className="font-display text-3xl font-semibold text-ink lg:text-4xl">
                    {displayName}
                  </h1>
                  {/* Favoritos del portal cliente (sin sesión → lleva al login) */}
                  <FavoriteHeart productId={product.id} />
                </div>
                {marketingTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {marketingTags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-social/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-social"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-sm text-ink/50">
                  Ref. <span className="font-mono">{displayRef}</span> ·{" "}
                  {totalStock > 0 ? (
                    <span className="tabular-nums">{totalStock.toLocaleString("es-ES")} uds en stock</span>
                  ) : (
                    <span>Fabricación bajo pedido</span>
                  )}
                </p>

                {/* Precio "desde" — con tachado del original si hay promo activa */}
                {finalFromPriceCents && finalFromPriceCents > 0 && (
                  <p className="mt-4 flex flex-wrap items-baseline gap-2 text-ink">
                    <span className="text-[11px] uppercase tracking-wider text-ink/55">
                      Desde
                    </span>
                    <span className="font-display text-2xl font-semibold text-accent tabular-nums">
                      {(finalFromPriceCents / 100).toLocaleString("es-ES", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      €
                    </span>
                    {activePromo &&
                      originalFromPriceCents &&
                      originalFromPriceCents > finalFromPriceCents && (
                        <span className="font-mono text-xs tabular-nums text-ink/40 line-through">
                          {(originalFromPriceCents / 100).toLocaleString("es-ES", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          €
                        </span>
                      )}
                    <span className="text-[11px] text-ink/55">/ud (sin IVA)</span>
                  </p>
                )}

                {/* El precio de arriba es el del producto liso. Decirlo aquí,
                    pegado a la cifra, es lo que evita la sorpresa al pedir
                    presupuesto: en un vaso de 0,13 €/ud la serigrafía cuesta
                    más que el vaso. */}
                {finalFromPriceCents && finalFromPriceCents > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-ink/60">
                    Precio del <strong className="font-semibold text-ink/75">producto sin personalizar</strong>.
                    El marcaje se presupuesta aparte (unidad + cliché).
                    {conMarcaje && (
                      <>
                        {" "}
                        Con marcaje a una tinta,{" "}
                        <span className="font-semibold tabular-nums text-ink/75">
                          {(conMarcaje.unitCents / 100).toLocaleString("es-ES", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          €/ud
                        </span>{" "}
                        orientativos para {conMarcaje.quantity.toLocaleString("es-ES")} uds, cliché incluido.
                      </>
                    )}
                  </p>
                )}

                {displayShortDescription && (
                  <p className="mt-5 text-base text-ink/75">{displayShortDescription}</p>
                )}

                {/* Formulario unificado:
                      cantidad → toggle marcaje SI/NO → opciones marcaje
                      (si SÍ) → total + CTAs.
                    Reemplaza la antigua trilogía PriceTierTable +
                    QuantityConfigurator + MarkingCalculator que mostraban
                    precios contradictorios y duplicaban lógica de cantidad. */}
                <ProductOrderForm
                  productSlug={product.slug}
                  productRef={displayRef}
                  productName={displayName}
                  primaryImageUrl={proxyImageUrl(product.primaryImageUrl)}
                  tiers={tiers}
                  baseCentsForEstimate={baseCents}
                  orderFixedPromo={pricing.orderFixedPromo}
                  colorOptions={colorOptions}
                  positions={product.positions.map((pos) => ({
                    id: pos.id,
                    positionId: pos.positionId,
                    maxWidthMm: pos.maxWidthMm,
                    maxHeightMm: pos.maxHeightMm,
                    techniques: pos.techniques.map((t) => ({
                      techniqueId: t.techniqueId,
                      techniqueCode: t.technique.code,
                      techniqueName: t.technique.name,
                      maxColors: t.maxColors,
                    })),
                  }))}
                />

                {/* CTA WhatsApp alternativo — para quien prefiera preguntar
                    por chat antes de configurar. Mensaje pre-rellenado. */}
                <div className="mt-4">
                  <WhatsAppCta
                    productName={displayName}
                    internalRef={product.internalRef}
                    productUrl={`https://merchandising.startidea.es/catalogo/${product.slug}`}
                    variant="secondary"
                  />
                </div>

                <CompareToggle slug={product.slug} />

                <MockupGenerator
                  productSlug={product.slug}
                  positions={product.positions.map((p) => ({ id: p.id, positionId: p.positionId }))}
                />

                <div className="mt-4">
                  <DeliveryEstimate />
                </div>

                <div className="mt-5 grid gap-2 text-sm text-ink/70">
                  <Trust>Boceto con tu logo gratis antes de producir — apruébalo tú primero</Trust>
                  <Trust>Producción en Centros Especiales de Empleo o talleres locales</Trust>
                  <Trust>Precio al instante · cotización formal opcional</Trust>
                  <Trust>Sin compromiso · Sin coste · Sin letra pequeña</Trust>
                </div>
              </section>

              <div data-product-region="technical" className="lg:col-start-1 lg:row-start-2">

              {/* Descripción larga + ficha técnica */}
              {displayDescription && (
                <div className="mt-12 rounded-3xl border border-line bg-bone-soft p-6 lg:p-8">
                  <h2 className="font-display text-xl font-semibold text-ink">Descripción</h2>
                  <p className="mt-4 whitespace-pre-line text-[15px] text-ink/80">
                    {displayDescription}
                  </p>
                </div>
              )}

              {/* Galería de imágenes extra (override admin) */}
              {extraImages.length > 0 && (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {extraImages.map((src, i) => (
                    <div
                      key={i}
                      className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-bone-soft"
                    >
                      <Image
                        src={src}
                        alt={`${displayName} — ${i + 2}`}
                        fill
                        sizes="(max-width:640px) 50vw, 33vw"
                        className="object-contain p-3"
                        unoptimized
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Ficha técnica */}
              <div className="mt-6 rounded-3xl border border-line bg-bone-soft p-6 lg:p-8">
                <h2 className="font-display text-xl font-semibold text-ink">Especificaciones técnicas</h2>
                <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  {publicBrand(product.brand) && (
                    <Spec label="Marca" value={publicBrand(product.brand)!} />
                  )}
                  {displayMaterial && <Spec label="Material" value={displayMaterial} />}
                  {product.weightG && <Spec label="Peso" value={`${product.weightG} g`} />}
                  {product.lengthMm ? (
                    <Spec
                      label="Dimensiones"
                      value={formatDimensions(product.lengthMm, product.widthMm, product.heightMm)}
                    />
                  ) : null}
                  <Spec label="Variantes" value={`${product.variants.length}`} />
                  <Spec
                    label="Disponibilidad"
                    value={totalStock > 0 ? `${totalStock.toLocaleString("es-ES")} uds en stock` : "Fabricación bajo pedido"}
                  />
                  {product.countryOfOrigin && (
                    <Spec label="Origen" value={product.countryOfOrigin} />
                  )}
                  <Spec label="Referencia" value={displayRef} />
                </dl>
              </div>

              {/* Tabla de tallas */}
              {sizes.length > 0 && (
                <div className="mt-6 rounded-3xl border border-line bg-bone p-6 lg:p-8">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    Tallas disponibles
                  </h2>
                  <p className="mt-2 text-sm text-ink/60">
                    {sizes.length} {sizes.length === 1 ? "talla" : "tallas"} en este producto.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {sizes.map((s) => {
                      const stock = product.variants
                        .filter((v) => v.size === s)
                        .reduce((sum, v) => sum + v.stockQty, 0);
                      return (
                        <div
                          key={s}
                          className="rounded-2xl border border-line bg-bone-soft px-4 py-3 text-center"
                        >
                          <p className="font-display text-lg font-semibold text-ink tabular-nums">
                            {s}
                          </p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-ink/50">
                            {stock > 0 ? `${stock.toLocaleString("es-ES")} uds` : "Bajo pedido"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Áreas y técnicas de marcaje */}
              {product.positions.length > 0 && (
                <div className="mt-6 rounded-3xl border border-line bg-bone p-6 lg:p-8">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    Áreas de marcaje
                  </h2>
                  <p className="mt-2 text-sm text-ink/60">
                    {product.positions.length} {product.positions.length === 1 ? "zona disponible" : "zonas disponibles"} para personalizar tu logo.{" "}
                    <AskDiego
                      label="¿Dudas? Pregunta a David"
                      context={`El cliente está viendo la ficha del producto "${displayName}" (ref ${displayRef}) y puede tener dudas sobre personalización, técnicas o cantidades. Ayúdale sobre ESTE producto.`}
                    />
                  </p>
                  <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                    {product.positions.map((pos, posIdx) => (
                      <li
                        key={pos.id}
                        className="overflow-hidden rounded-2xl border border-line bg-bone-soft"
                      >
                        {proxyImageUrl(pos.imageUrl) && (
                          <div className="relative aspect-[4/3] bg-bone">
                            <Image
                              src={proxyImageUrl(pos.imageUrl)!}
                              alt={`Zona ${positionOptionLabel(pos, posIdx)}`}
                              fill
                              sizes="(max-width:640px) 100vw, 50vw"
                              className="object-contain p-3"
                              unoptimized
                            />
                          </div>
                        )}
                        <div className="p-5">
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                            {positionOptionLabel(pos, posIdx)}
                          </p>
                          {(pos.maxWidthMm || pos.maxHeightMm) && (
                            <p className="mt-2 font-display text-xl font-semibold text-ink tabular-nums">
                              {pos.maxWidthMm ?? "?"} × {pos.maxHeightMm ?? "?"}
                              <span className="ml-1 text-xs font-normal text-ink/50">mm</span>
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {pos.techniques.length > 0 ? (
                              pos.techniques.map((t) => (
                                <span
                                  key={t.techniqueId}
                                  className="rounded-full bg-accent-wash px-2.5 py-0.5 text-[11px] font-medium text-accent-deep"
                                >
                                  {t.technique.name}
                                  {t.maxColors ? ` · ${t.maxColors} col.` : ""}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-ink/40">Sin técnicas asignadas</span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
          </div>
          </ProductColorProvider>
        </section>

        <RelatedProducts
          currentId={product.id}
          categoryId={product.categoryId}
          tags={product.tags}
          supplier={product.supplier}
        />
      </main>
      <Footer />
    </>
  );
}

// Orden natural de tallas: XXS, XS, S, M, L, XL, XXL, 3XL... + tallas numéricas
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
function naturalSizeOrder(a: string, b: string): number {
  const ai = SIZE_ORDER.indexOf(a.toUpperCase());
  const bi = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ai >= 0 && bi >= 0) return ai - bi;
  if (ai >= 0) return -1;
  if (bi >= 0) return 1;
  // Numéricas o textos arbitrarios: alfanumérico
  const aNum = parseFloat(a);
  const bNum = parseFloat(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
  return a.localeCompare(b);
}

function formatDimensions(lengthMm: number, widthMm: number | null, heightMm: number | null): string {
  // Omite cualquier dimensión que sea 0 (e.g. toallas planas)
  const parts = [lengthMm, widthMm, heightMm].filter((d): d is number => typeof d === "number" && d > 0);
  if (parts.length === 0) return "—";
  return `${parts.join("×")} mm`;
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink/50">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function Trust({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-social" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
