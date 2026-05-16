import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";
import { ProductOrderForm } from "@/components/ProductOrderForm";
import { CompareToggle } from "@/components/CompareToggle";
// ProductOrderForm fusiona PriceTierTable + QuantityConfigurator + MarkingCalculator
// en un único flujo: cantidad → toggle marcaje → opciones → total + CTAs.
import { MockupGenerator } from "@/components/MockupGenerator";
import { WhatsAppCta } from "@/components/WhatsAppCta";
import { estimateBaseCentsFromName, type PriceTier } from "@/lib/pricing";
import { publicRef } from "@/lib/internal-ref";
import { publicBrand } from "@/lib/brand-filter";
import { displayPositionId } from "@/lib/marking-position-display";
import { proxyImageUrl } from "@/lib/proxy-image";
import { JsonLd } from "@/components/JsonLd";
import { productJsonLd, breadcrumbJsonLd } from "@/lib/jsonld";

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
  const name = p.override?.customName || p.name;
  const visibleBrand = publicBrand(p.brand);
  const title = p.override?.metaTitle || `${name}${visibleBrand ? ` · ${visibleBrand}` : ""}`;
  const description =
    p.override?.metaDescription ||
    p.shortDescription?.slice(0, 160) ||
    `${name} personalizable con tu logo.`;
  return {
    title,
    description,
    openGraph: {
      images: proxyImageUrl(p.primaryImageUrl)
        ? [{ url: proxyImageUrl(p.primaryImageUrl)! }]
        : [],
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
        include: { priceTiers: { orderBy: { minQty: "asc" } } },
      },
      positions: {
        include: { techniques: { include: { technique: true } } },
      },
      override: true,
    },
  });
  // Slug antiguo (contenía supplier SKU, p.ej. "-mo9812"): 301 al slug actual
  if (!product) {
    const redirectEntry = await prisma.productSlugRedirect.findUnique({
      where: { oldSlug: slug },
      select: { product: { select: { slug: true } } },
    });
    if (redirectEntry?.product?.slug) {
      permanentRedirect(`/catalogo/${redirectEntry.product.slug}`);
    }
    notFound();
  }
  // Si admin lo marcó hidden, no se muestra al público
  if (product.override?.hidden) notFound();

  // Aplicar overrides admin (si existen) sobre los datos base
  const ov = product.override;
  const displayName = ov?.customName || product.name;
  const displayDescription = ov?.customDescription || product.longDescription;
  const displayShortDescription =
    ov?.customDescription || product.enhancedShortDescription || product.shortDescription;
  const displayFromPriceCents =
    ov?.customFromPriceCents != null
      ? ov.customFromPriceCents
      : ov?.marginPct != null && product.fromPriceCents
        ? Math.round((product.fromPriceCents * (100 + ov.marginPct)) / 100)
        : product.fromPriceCents;
  const extraImages = ov?.extraImages ?? [];
  const marketingTags = ov?.marketingTags ?? [];
  // Referencia pública Startidea — nunca exponer supplierRef al cliente
  const displayRef = publicRef(product);

  const totalStock = product.variants.reduce((sum, v) => sum + v.stockQty, 0);
  const colorVariants = product.variants.filter((v) => v.colorName);

  // Tabla de tallas — agrupar variantes únicas por size si existe
  const sizes = Array.from(
    new Set(product.variants.map((v) => v.size).filter((s): s is string => !!s)),
  ).sort(naturalSizeOrder);

  // Tarifas: si alguna variant tiene priceTiers (del proveedor), las usamos.
  // Si no, generamos estimate desde el nombre.
  // Si admin override define un precio explícito, descartamos tiers del proveedor
  // y reconstruimos con ese precio como base. Admin gana sobre proveedor.
  const adminOverridesPrice =
    ov?.customFromPriceCents != null || ov?.marginPct != null;
  const variantWithTiers = adminOverridesPrice
    ? null
    : product.variants.find((v) => v.priceTiers.length > 0);
  const tiers: PriceTier[] | undefined = variantWithTiers
    ? variantWithTiers.priceTiers.map((t) => ({
        minQty: t.minQty,
        unitPriceCents: t.unitPriceCents,
        source: "PROVIDER" as const,
      }))
    : undefined;
  const baseCents = tiers
    ? undefined
    : displayFromPriceCents ?? estimateBaseCentsFromName(product.name, product.category?.name);

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
    primaryImageUrl: product.primaryImageUrl,
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
          <div className="mx-auto grid max-w-8xl gap-12 px-6 lg:grid-cols-[1.3fr,1fr] lg:px-10">
            {/* IZQUIERDA — galería + variantes + descripción */}
            <div>
              <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-bone-soft">
                {proxyImageUrl(product.primaryImageUrl) ? (
                  <Image
                    src={proxyImageUrl(product.primaryImageUrl)!}
                    alt={displayName}
                    fill
                    sizes="(max-width:1024px) 100vw, 60vw"
                    unoptimized
                    className="object-contain p-8"
                    priority
                  />
                ) : (
                  <div className="grid h-full place-items-center text-ink/30">Sin imagen</div>
                )}
              </div>

              {colorVariants.length > 1 && (
                <div className="mt-6">
                  <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
                    {colorVariants.length} variantes de color
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {colorVariants.slice(0, 14).map((v) => (
                      <div
                        key={v.id}
                        className="relative h-16 w-16 overflow-hidden rounded-xl border border-line bg-bone"
                        title={v.colorName ?? undefined}
                      >
                        {proxyImageUrl(v.imageUrl) && (
                          <Image
                            src={proxyImageUrl(v.imageUrl)!}
                            alt={v.colorName ?? v.sku}
                            fill
                            sizes="64px"
                            className="object-contain p-1"
                            unoptimized
                          />
                        )}
                      </div>
                    ))}
                    {colorVariants.length > 14 && (
                      <div className="grid h-16 w-16 place-items-center rounded-xl border border-line text-xs text-ink/50">
                        +{colorVariants.length - 14}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                  {product.material && <Spec label="Material" value={product.material} />}
                  {product.weightG && <Spec label="Peso" value={`${product.weightG} g`} />}
                  {product.lengthMm ? (
                    <Spec
                      label="Dimensiones"
                      value={formatDimensions(product.lengthMm, product.widthMm, product.heightMm)}
                    />
                  ) : null}
                  <Spec label="Variantes" value={`${product.variants.length}`} />
                  <Spec label="Stock total" value={totalStock.toLocaleString("es-ES")} />
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
                    {product.positions.length} {product.positions.length === 1 ? "zona disponible" : "zonas disponibles"} para personalizar tu logo.
                  </p>
                  <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                    {product.positions.map((pos) => (
                      <li
                        key={pos.id}
                        className="overflow-hidden rounded-2xl border border-line bg-bone-soft"
                      >
                        {proxyImageUrl(pos.imageUrl) && (
                          <div className="relative aspect-[4/3] bg-bone">
                            <Image
                              src={proxyImageUrl(pos.imageUrl)!}
                              alt={`Zona ${displayPositionId(pos.positionId)}`}
                              fill
                              sizes="(max-width:640px) 100vw, 50vw"
                              className="object-contain p-3"
                              unoptimized
                            />
                          </div>
                        )}
                        <div className="p-5">
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                            {displayPositionId(pos.positionId)}
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

            {/* DERECHA — sticky con info + configurador */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              {publicBrand(product.brand) && (
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
                  {publicBrand(product.brand)}
                </p>
              )}
              <h1 className="mt-3 font-display text-3xl font-semibold text-ink lg:text-4xl">
                {displayName}
              </h1>
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
                Ref. <span className="font-mono">{displayRef}</span> · Stock total:{" "}
                <span className="tabular-nums">{totalStock.toLocaleString("es-ES")}</span>
              </p>

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
                  productUrl={`https://merchandising.hubstartidea.es/catalogo/${product.slug}`}
                  variant="secondary"
                />
              </div>

              <CompareToggle slug={product.slug} />

              <MockupGenerator
                productSlug={product.slug}
                positions={product.positions.map((p) => ({ id: p.id, positionId: p.positionId }))}
              />

              <div className="mt-5 grid gap-2 text-sm text-ink/70">
                <Trust>Producción en Centros Especiales de Empleo o talleres locales</Trust>
                <Trust>Cotización cerrada en 24 horas laborables</Trust>
                <Trust>Sin compromiso · Sin coste · Sin letra pequeña</Trust>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
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
