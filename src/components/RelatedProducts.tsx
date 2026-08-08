import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { publicRef } from "@/lib/internal-ref";
import { publicProductName } from "@/lib/product-name";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Server component: 6 productos similares al final de la ficha.
 * Estrategia de selección (en cascada):
 *   1. Misma `categoryId` (relevancia máxima)
 *   2. Si no hay 6, completa con productos que comparten ≥1 tag
 *   3. Si sigue faltando, completa con últimos activos del mismo supplier
 *
 * Sólo productos activos CON precio (fromPriceCents > 0) — evita el bug
 * de "no se puede pagar con tarjeta" al añadir productos sin precio.
 *
 * Beneficios:
 *  - Aumenta páginas por sesión (menos bounce)
 *  - Internal linking masivo → SEO catálogo
 *  - Más exposición a productos → mayor conversión
 */
export async function RelatedProducts({
  currentId,
  categoryId,
  tags,
  supplier,
}: {
  currentId: string;
  categoryId: string | null;
  tags: string[];
  supplier: string;
}) {
  const SELECT = {
    id: true,
    slug: true,
    name: true,
    supplierRef: true,
    internalRef: true,
    supplier: true,
    primaryImageUrl: true,
    fromPriceCents: true,
    override: { select: { customName: true } },
  } as const;

  const TAKE = 6;
  const seen = new Set<string>([currentId]);
  let products: Array<{
    id: string;
    slug: string;
    name: string;
    supplierRef: string;
    internalRef: string | null;
    supplier: string;
    primaryImageUrl: string | null;
    fromPriceCents: number | null;
    override: { customName: string | null } | null;
  }> = [];

  try {
    // Capa 1: misma categoryId
    if (categoryId) {
      const sameCategory = await prisma.product.findMany({
        where: {
          id: { notIn: Array.from(seen) },
          active: true,
          categoryId,
          fromPriceCents: { gt: 0 },
        },
        select: SELECT,
        take: TAKE,
        orderBy: { fromPriceCents: "asc" },
      });
      products = sameCategory;
      products.forEach((p) => seen.add(p.id));
    }

    // Capa 2: tags comunes
    if (products.length < TAKE && tags.length > 0) {
      const fill = await prisma.product.findMany({
        where: {
          id: { notIn: Array.from(seen) },
          active: true,
          tags: { hasSome: tags },
          fromPriceCents: { gt: 0 },
        },
        select: SELECT,
        take: TAKE - products.length,
        orderBy: { fromPriceCents: "asc" },
      });
      products = [...products, ...fill];
      fill.forEach((p) => seen.add(p.id));
    }

    // Capa 3: completar con últimos del mismo supplier
    if (products.length < TAKE) {
      const fill = await prisma.product.findMany({
        where: {
          id: { notIn: Array.from(seen) },
          active: true,
          supplier: supplier as "midocean" | "makito" | "cifra",
          fromPriceCents: { gt: 0 },
        },
        select: SELECT,
        take: TAKE - products.length,
        orderBy: { fromPriceCents: "asc" },
      });
      products = [...products, ...fill];
    }
  } catch {
    return null;
  }

  if (products.length === 0) return null;

  return (
    <section className="border-t border-line bg-bone-soft py-16 lg:py-20">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Sigue explorando
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-ink lg:text-3xl">
              Productos similares al que estás viendo
            </h2>
          </div>
          <Link
            href="/catalogo"
            className="text-sm font-medium text-accent transition hover:text-accent/80"
          >
            Ver todo el catálogo →
          </Link>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {products.map((p) => {
            const ref = publicRef(p);
            const img = proxyImageUrl(p.primaryImageUrl);
            const name = publicProductName(p.name, p.override?.customName);
            return (
              <li key={p.id}>
                <Link
                  href={`/catalogo/${p.slug}`}
                  className="group block h-full overflow-hidden rounded-2xl border border-line bg-bone transition hover:border-accent/40 hover:shadow-md"
                >
                  <div className="relative aspect-square overflow-hidden bg-bone-soft">
                    {img ? (
                      <Image
                        src={img}
                        alt={name}
                        fill
                        sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 16vw"
                        className="object-contain p-3 transition duration-500 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-ink/30">
                        Sin imagen
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink/40">
                      Ref. {ref}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-medium text-ink group-hover:text-accent">
                      {name}
                    </h3>
                    {p.fromPriceCents != null && p.fromPriceCents > 0 && (
                      <p className="mt-1.5 text-xs text-ink/60">
                        Desde{" "}
                        <span className="font-semibold tabular-nums text-ink">
                          {EUR.format(p.fromPriceCents / 100)}
                        </span>
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
