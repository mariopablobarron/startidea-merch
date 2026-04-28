import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";
import { QuantityConfigurator } from "@/components/QuantityConfigurator";
import { estimateBaseCentsFromName, type PriceTier } from "@/lib/pricing";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await prisma.product.findUnique({
    where: { slug },
    select: { name: true, brand: true, shortDescription: true, primaryImageUrl: true },
  });
  if (!p) return { title: "Producto no encontrado" };
  return {
    title: `${p.name}${p.brand ? ` · ${p.brand}` : ""}`,
    description: p.shortDescription?.slice(0, 160) || `${p.name} personalizable con tu logo.`,
    openGraph: {
      images: p.primaryImageUrl ? [{ url: p.primaryImageUrl }] : [],
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
    },
  });
  if (!product) notFound();

  const totalStock = product.variants.reduce((sum, v) => sum + v.stockQty, 0);
  const colorVariants = product.variants.filter((v) => v.colorName);

  // Tarifas: si alguna variant tiene priceTiers (del proveedor), las usamos.
  // Si no, generamos estimate desde el nombre.
  const variantWithTiers = product.variants.find((v) => v.priceTiers.length > 0);
  const tiers: PriceTier[] | undefined = variantWithTiers
    ? variantWithTiers.priceTiers.map((t) => ({
        minQty: t.minQty,
        unitPriceCents: t.unitPriceCents,
        source: "PROVIDER" as const,
      }))
    : undefined;
  const baseCents = tiers ? undefined : estimateBaseCentsFromName(product.name, product.category?.name);

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
  breadcrumbs.push({ name: product.name });

  return (
    <>
      <Nav />
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
              <div className="relative aspect-square overflow-hidden rounded-3xl border border-ink/10 bg-bone-soft">
                {product.primaryImageUrl ? (
                  <Image
                    src={product.primaryImageUrl}
                    alt={product.name}
                    fill
                    sizes="(max-width:1024px) 100vw, 60vw"
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
                        className="relative h-16 w-16 overflow-hidden rounded-xl border border-ink/10 bg-bone"
                        title={v.colorName ?? undefined}
                      >
                        {v.imageUrl && (
                          <Image
                            src={v.imageUrl}
                            alt={v.colorName ?? v.sku}
                            fill
                            sizes="64px"
                            className="object-contain p-1"
                          />
                        )}
                      </div>
                    ))}
                    {colorVariants.length > 14 && (
                      <div className="grid h-16 w-16 place-items-center rounded-xl border border-ink/10 text-xs text-ink/50">
                        +{colorVariants.length - 14}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Descripción larga + ficha técnica */}
              {product.longDescription && (
                <div className="mt-12 rounded-3xl border border-ink/10 bg-bone-soft p-6 lg:p-8">
                  <h2 className="font-display text-xl font-semibold text-ink">Descripción</h2>
                  <p className="mt-4 whitespace-pre-line text-[15px] text-ink/80">
                    {product.longDescription}
                  </p>
                </div>
              )}

              {/* Ficha técnica */}
              <div className="mt-6 rounded-3xl border border-ink/10 bg-bone-soft p-6 lg:p-8">
                <h2 className="font-display text-xl font-semibold text-ink">Especificaciones técnicas</h2>
                <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  {product.brand && <Spec label="Marca" value={product.brand} />}
                  {product.material && <Spec label="Material" value={product.material} />}
                  {product.weightG && <Spec label="Peso" value={`${product.weightG} g`} />}
                  {product.lengthMm ? (
                    <Spec
                      label="Dimensiones"
                      value={`${product.lengthMm}×${product.widthMm ?? "?"}${product.heightMm ? `×${product.heightMm}` : ""} mm`}
                    />
                  ) : null}
                  <Spec label="Variantes" value={`${product.variants.length}`} />
                  <Spec label="Stock total" value={totalStock.toLocaleString("es-ES")} />
                  {product.countryOfOrigin && (
                    <Spec label="Origen" value={product.countryOfOrigin} />
                  )}
                  {product.supplierRef && <Spec label="Referencia" value={product.supplierRef} />}
                </dl>
              </div>

              {/* Áreas y técnicas de marcaje */}
              {product.positions.length > 0 && (
                <div className="mt-6 rounded-3xl border border-ink/10 bg-bone-soft p-6 lg:p-8">
                  <h2 className="font-display text-xl font-semibold text-ink">
                    Áreas de marcaje
                  </h2>
                  <p className="mt-2 text-sm text-ink/60">
                    {product.positions.length} {product.positions.length === 1 ? "zona disponible" : "zonas disponibles"} para personalizar.
                  </p>
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {product.positions.map((pos) => (
                      <li key={pos.id} className="rounded-2xl bg-bone p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-accent">
                          {pos.positionId}
                        </p>
                        {(pos.maxWidthMm || pos.maxHeightMm) && (
                          <p className="mt-2 font-display text-lg font-semibold text-ink tabular-nums">
                            {pos.maxWidthMm ?? "?"} × {pos.maxHeightMm ?? "?"} mm
                          </p>
                        )}
                        <p className="mt-2 text-xs text-ink/60">
                          {pos.techniques
                            .map(
                              (t) =>
                                `${t.technique.name}${
                                  t.maxColors ? ` (${t.maxColors} col.)` : ""
                                }`,
                            )
                            .join(" · ") || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* DERECHA — sticky con info + configurador */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              {product.brand && (
                <p className="text-xs font-medium uppercase tracking-wider text-accent">
                  {product.brand}
                </p>
              )}
              <h1 className="mt-3 font-display text-3xl font-semibold text-ink lg:text-4xl">
                {product.name}
              </h1>
              <p className="mt-2 text-sm text-ink/50">
                Ref. <span className="font-mono">{product.supplierRef}</span> · Stock total:{" "}
                <span className="tabular-nums">{totalStock.toLocaleString("es-ES")}</span>
              </p>

              {product.shortDescription && (
                <p className="mt-5 text-base text-ink/75">{product.shortDescription}</p>
              )}

              <QuantityConfigurator
                productSlug={product.slug}
                productRef={product.supplierRef}
                productName={product.name}
                tiers={tiers}
                baseCentsForEstimate={baseCents}
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
