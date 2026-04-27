import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";
import { ProductQuoteCta } from "@/components/ProductQuoteCta";

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
      variants: { orderBy: { sku: "asc" } },
      positions: {
        include: {
          techniques: { include: { technique: true } },
        },
      },
    },
  });
  if (!product) notFound();

  const totalStock = product.variants.reduce((sum, v) => sum + v.stockQty, 0);
  const colorVariants = product.variants.filter((v) => v.colorName);
  const breadcrumbs: Array<{ name: string; href?: string }> = [
    { name: "Catálogo", href: "/catalogo" },
  ];
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
    breadcrumbs.push({
      name: product.category.name,
      href: `/catalogo?cat=${product.category.slug}`,
    });
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

        <section className="py-12 lg:py-16">
          <div className="mx-auto grid max-w-8xl gap-12 px-6 lg:grid-cols-[1.2fr,1fr] lg:px-10">
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
                    {colorVariants.slice(0, 12).map((v) => (
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
                    {colorVariants.length > 12 && (
                      <div className="grid h-16 w-16 place-items-center rounded-xl border border-ink/10 text-xs text-ink/50">
                        +{colorVariants.length - 12}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              {product.brand && (
                <p className="text-xs font-medium uppercase tracking-wider text-accent">
                  {product.brand}
                </p>
              )}
              <h1 className="mt-3 font-display text-4xl font-semibold text-ink lg:text-5xl">
                {product.name}
              </h1>
              <p className="mt-2 text-sm text-ink/50">
                Ref. {product.supplierRef} · Stock total: {totalStock.toLocaleString("es-ES")}
              </p>

              {product.shortDescription && (
                <p className="mt-6 text-lg text-ink/75">{product.shortDescription}</p>
              )}

              <div className="mt-8 grid grid-cols-2 gap-4 rounded-2xl border border-ink/10 bg-bone-soft p-5 text-sm">
                {product.material && <Stat label="Material" value={product.material} />}
                {product.weightG && <Stat label="Peso" value={`${product.weightG} g`} />}
                {product.lengthMm && (
                  <Stat
                    label="Dimensiones"
                    value={`${product.lengthMm}×${product.widthMm ?? "?"}×${product.heightMm ?? "?"} mm`}
                  />
                )}
                <Stat label="Variantes" value={`${product.variants.length}`} />
              </div>

              <ProductQuoteCta
                productSlug={product.slug}
                productRef={product.supplierRef}
                productName={product.name}
              />

              {product.positions.length > 0 && (
                <details className="mt-10 rounded-2xl border border-ink/10 bg-bone-soft p-5">
                  <summary className="cursor-pointer text-sm font-medium text-ink">
                    Opciones de marcaje ({product.positions.length} {product.positions.length === 1 ? "zona" : "zonas"})
                  </summary>
                  <ul className="mt-4 space-y-3 text-sm">
                    {product.positions.map((pos) => (
                      <li key={pos.id} className="border-t border-ink/10 pt-3 first:border-t-0 first:pt-0">
                        <p className="font-medium text-ink">{pos.positionId}</p>
                        <p className="text-xs text-ink/60">
                          Área máx: {pos.maxWidthMm ?? "?"} × {pos.maxHeightMm ?? "?"} mm
                        </p>
                        <p className="mt-1 text-xs text-ink/60">
                          Técnicas:{" "}
                          {pos.techniques
                            .map((t) => `${t.technique.name}${t.maxColors ? ` (hasta ${t.maxColors})` : ""}`)
                            .join(" · ") || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </section>

        {product.longDescription && (
          <section className="border-t border-ink/10 bg-bone-soft py-16">
            <div className="mx-auto max-w-3xl px-6 lg:px-10">
              <h2 className="font-display text-2xl font-semibold text-ink">Descripción</h2>
              <p className="mt-6 whitespace-pre-line text-ink/80">{product.longDescription}</p>
            </div>
          </section>
        )}
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink/50">{label}</dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}
