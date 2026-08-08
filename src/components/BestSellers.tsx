import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { publicRef } from "@/lib/internal-ref";
import { publicProductName } from "@/lib/product-name";

/**
 * Best-sellers / destacados en la home — productos con precio "desde" visible,
 * para dar idea de precio sin obligar a cotizar (patrón competidores top).
 * Curado por override.featured; rellena con los más recientes para no quedar
 * vacío. Server component.
 */
export async function BestSellers() {
  let products: Array<{
    id: string;
    slug: string;
    name: string;
    primaryImageUrl: string | null;
    fromPriceCents: number | null;
    internalRef: string | null;
    category: { name: string } | null;
    override: { customName: string | null; customFromPriceCents: number | null; marginPct: number | null } | null;
  }> = [];

  try {
    products = await prisma.product.findMany({
      where: {
        active: true,
        NOT: { override: { is: { hidden: true } } },
        fromPriceCents: { gt: 0 },
      },
      orderBy: [{ override: { featured: "desc" } }, { syncedAt: "desc" }],
      take: 8,
      select: {
        id: true,
        slug: true,
        name: true,
        primaryImageUrl: true,
        fromPriceCents: true,
        internalRef: true,
        category: { select: { name: true } },
        override: { select: { customName: true, customFromPriceCents: true, marginPct: true } },
      },
    });
  } catch {
    return null;
  }
  if (products.length === 0) return null;

  return (
    <section className="bg-bone py-16 lg:py-20">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Catálogo</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-section font-semibold text-ink">Productos destacados</h2>
          <Link href="/catalogo" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
            Ver todo el catálogo →
          </Link>
        </div>
        <p className="mt-3 max-w-2xl text-ink/65">
          Una selección con <strong>precio desde</strong>, sin tener que pedir cotización. Todo se
          personaliza con tu logo y se produce con impacto social.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
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
                <h3 className="mt-4 line-clamp-2 font-display text-base font-semibold text-ink">{name}</h3>
                {p.category?.name && (
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-ink/50">{p.category.name}</p>
                )}
                {priceCents && priceCents > 0 ? (
                  <p className="mt-2 flex items-baseline gap-1 text-ink">
                    <span className="text-[11px] uppercase tracking-wider text-ink/50">Desde</span>
                    <span className="font-display text-lg font-semibold text-accent tabular-nums">
                      {(priceCents / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                    <span className="text-[11px] text-ink/50">/ud</span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ink/50">Precio bajo cotización</p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
