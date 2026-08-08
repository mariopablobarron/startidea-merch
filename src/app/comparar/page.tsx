import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";
import { defaultTiersFromBase, formatMoney, pickTier } from "@/lib/pricing";
import { computeClientPricing } from "@/lib/product-pricing";
import { loadActivePromotions } from "@/lib/promotions";
import { publicRef } from "@/lib/internal-ref";
import { proxyImageUrl } from "@/lib/proxy-image";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { legacyHtmlToText, publicProductName } from "@/lib/product-name";

export const metadata: Metadata = {
  title: "Comparar productos · Decide entre 2 ó 3 referencias",
  description:
    "Compara hasta 3 productos del catálogo lado a lado: stock, dimensiones, peso, material, áreas de marcaje, técnicas y precio orientativo por cantidades.",
  alternates: { canonical: "https://merchandising.startidea.es/comparar" },
};

export const revalidate = 3600;

const REF_QTY = 100; // cantidad de referencia para mostrar precio comparativo

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ slugs?: string }>;
}) {
  const sp = await searchParams;
  const slugs = (sp.slugs || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  const products = slugs.length
    ? await prisma.product.findMany({
        where: { slug: { in: slugs }, active: true, NOT: { override: { is: { hidden: true } } } },
        include: {
          category: { select: { name: true } },
          override: {
            select: {
              customName: true,
              customFromPriceCents: true,
              marginPct: true,
              marketingTags: true,
            },
          },
          variants: {
            select: { stockQty: true, colorName: true, size: true },
          },
          positions: {
            include: { techniques: { include: { technique: true } } },
          },
        },
      })
    : [];

  // Mantener el orden que el usuario indicó en el query string
  const ordered = slugs.map((s) => products.find((p) => p.slug === s)).filter(Boolean);

  // Precio /100 uds con la cascada REAL (override > promo > margen sobre los
  // tramos netos del proveedor) — la única página pública que usaba el
  // heurístico por nombre podía contradecir a la ficha (auditoría 2026-07-15).
  const activePromos = ordered.length ? await loadActivePromotions() : [];
  const price100: Record<string, number | null> = {};
  for (const p of ordered) {
    if (!p) continue;
    const variantWithTiers = await prisma.productVariant.findFirst({
      where: { productId: p.id, priceTiers: { some: {} } },
      select: {
        priceTiers: {
          orderBy: { minQty: "asc" },
          select: { minQty: true, unitPriceCents: true },
        },
      },
    });
    const pricing = computeClientPricing({
      product: {
        id: p.id,
        name: p.name,
        brand: p.brand,
        categoryId: p.categoryId,
        fromPriceCents: p.fromPriceCents,
        category: p.category,
      },
      override: p.override ?? null,
      providerNetTiers: variantWithTiers?.priceTiers,
      activePromos,
    });
    const tiers =
      pricing.clientTiers ??
      (pricing.baseCentsForEstimate != null
        ? defaultTiersFromBase(pricing.baseCentsForEstimate)
        : undefined);
    const tier = tiers ? pickTier(tiers, REF_QTY) : null;
    price100[p.slug] = tier?.unitPriceCents ?? null;
  }

  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Inicio", url: "/" }, { name: "Comparador", url: "/comparar" }]) as never} />
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-14 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Comparador
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              Compara hasta 3 productos lado a lado.
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Stock, dimensiones, técnicas de marcaje y precio orientativo a 100 unidades. Si
              llegas a esta página vacía, abre fichas y pulsa &quot;Añadir a comparador&quot; (próximamente)
              o pásame los slugs en la URL: <code className="rounded bg-bone-soft px-1.5 py-0.5 text-xs">?slugs=atoll-100,tyvek</code>.
            </p>
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            {ordered.length === 0 && <EmptyState />}
            {ordered.length > 0 && (
              <ComparatorTable products={ordered as ComparatorProduct[]} price100={price100} />
            )}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}

type ComparatorProduct = NonNullable<
  Awaited<ReturnType<typeof prisma.product.findMany<{
    where: { slug: { in: string[] }; active: true };
    include: {
      category: { select: { name: true } };
      override: {
        select: {
          customName: true;
          customFromPriceCents: true;
          marginPct: true;
          marketingTags: true;
        };
      };
      variants: { select: { stockQty: true; colorName: true; size: true } };
      positions: { include: { techniques: { include: { technique: true } } } };
    };
  }>>>[number]
>;

function ComparatorTable({
  products,
  price100,
}: {
  products: ComparatorProduct[];
  price100: Record<string, number | null>;
}) {
  const cols = products.length;
  const labels: { key: string; label: string; render: (p: ComparatorProduct) => React.ReactNode }[] =
    [
      {
        key: "image",
        label: "",
        render: (p) => (
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-bone-soft">
            {proxyImageUrl(p.primaryImageUrl) ? (
              <Image
                src={proxyImageUrl(p.primaryImageUrl)!}
                alt={publicProductName(p.name, p.override?.customName)}
                fill
                sizes="33vw"
                className="object-contain p-4"
              />
            ) : (
              <div className="grid h-full place-items-center text-xs text-ink/40">Sin imagen</div>
            )}
          </div>
        ),
      },
      {
        key: "name",
        label: "Producto",
        render: (p) => (
          <Link
            href={`/catalogo/${p.slug}`}
            className="font-display text-lg font-semibold text-ink transition hover:text-accent"
          >
            {publicProductName(p.name, p.override?.customName)}
          </Link>
        ),
      },
      {
        key: "ref",
        label: "Referencia",
        // Ref pública Startidea (STM-XXX), nunca supplierRef del proveedor
        render: (p) => <span className="font-mono text-sm">{publicRef(p)}</span>,
      },
      {
        key: "category",
        label: "Categoría",
        render: (p) => p.category?.name || "—",
      },
      {
        key: "material",
        label: "Material",
        render: (p) => legacyHtmlToText(p.material) || "—",
      },
      {
        key: "dim",
        label: "Dimensiones",
        render: (p) => {
          const parts = [p.lengthMm, p.widthMm, p.heightMm].filter(
            (d): d is number => typeof d === "number" && d > 0,
          );
          return parts.length ? `${parts.join("×")} mm` : "—";
        },
      },
      {
        key: "weight",
        label: "Peso",
        render: (p) => (p.weightG ? `${p.weightG} g` : "—"),
      },
      {
        key: "variants",
        label: "Variantes",
        render: (p) => `${p.variants.length} (${p.variants.filter((v) => v.colorName).length} con color)`,
      },
      {
        key: "stock",
        label: "Stock total",
        render: (p) => (
          <span className="tabular-nums">
            {p.variants.reduce((sum, v) => sum + v.stockQty, 0).toLocaleString("es-ES")}
          </span>
        ),
      },
      {
        key: "price100",
        label: "Precio orientativo / 100 uds",
        render: (p) => {
          const cents = price100[p.slug];
          if (cents == null) return <span className="text-sm text-ink/55">Consultar</span>;
          return (
            <span className="font-display text-lg font-semibold tabular-nums text-ink">
              {formatMoney(cents).formatted}
              <span className="ml-1 text-xs font-normal text-ink/50">/ud</span>
            </span>
          );
        },
      },
      {
        key: "positions",
        label: "Zonas de marcaje",
        render: (p) =>
          p.positions.length === 0 ? (
            "—"
          ) : (
            <div className="flex flex-wrap gap-1">
              {p.positions.slice(0, 4).map((pos) => (
                <span
                  key={pos.id}
                  className="rounded-full bg-bone-soft px-2 py-0.5 text-[11px] text-ink/70"
                >
                  {pos.positionId}
                </span>
              ))}
              {p.positions.length > 4 && (
                <span className="text-[11px] text-ink/50">+{p.positions.length - 4}</span>
              )}
            </div>
          ),
      },
      {
        key: "techniques",
        label: "Técnicas",
        render: (p) => {
          const techs = new Map<string, string>();
          for (const pos of p.positions) {
            for (const t of pos.techniques) {
              techs.set(t.technique.code, t.technique.name);
            }
          }
          if (techs.size === 0) return "—";
          return (
            <div className="flex flex-wrap gap-1">
              {Array.from(techs.values())
                .slice(0, 5)
                .map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-accent-wash px-2 py-0.5 text-[11px] text-accent-deep"
                  >
                    {name}
                  </span>
                ))}
            </div>
          );
        },
      },
      {
        key: "cta",
        label: "",
        render: (p) => (
          <Link
            href={`/catalogo/${p.slug}`}
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone transition hover:bg-accent"
          >
            Ver ficha →
          </Link>
        ),
      },
    ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-x-2">
        <thead>
          <tr>
            <th className="w-44" />
            {products.map((p) => (
              <th key={p.id} className="text-left text-sm">
                {/* placeholder vacío; las celdas debajo cargan el contenido */}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((row) => (
            <tr key={row.key}>
              <td className="align-middle text-xs uppercase tracking-wider text-ink/50">
                {row.label}
              </td>
              {products.map((p) => (
                <td
                  key={p.id}
                  className="border-b border-line py-4 align-middle text-sm text-ink"
                  style={{ width: `${Math.floor(90 / cols)}%` }}
                >
                  {row.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-bone p-16 text-center">
      <p className="font-display text-2xl font-semibold text-ink">
        Aún no hay productos para comparar.
      </p>
      <p className="mx-auto mt-3 max-w-md text-ink/60">
        Pasa los slugs en la URL separados por coma. Ejemplo:
      </p>
      <p className="mt-4 inline-block rounded-full bg-bone-soft px-4 py-1.5 font-mono text-xs">
        /comparar?slugs=atoll-100,tyvek
      </p>
      <Link
        href="/catalogo"
        className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone transition hover:bg-accent"
      >
        Ver catálogo
      </Link>
    </div>
  );
}
