import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

/**
 * Grid de "Trabajos realizados" — server component.
 *
 * variant="home" muestra 8 destacados en home.
 * variant="full" muestra todos en la página /trabajos.
 *
 * Sin items en BD → no renderiza nada (mejor que un placeholder vacío).
 */
export async function PortfolioGrid({
  variant = "home",
  limit,
}: {
  variant?: "home" | "full";
  limit?: number;
}) {
  let items: Awaited<ReturnType<typeof prisma.portfolioItem.findMany>> = [];
  try {
    items = await prisma.portfolioItem.findMany({
      where: {
        active: true,
        ...(variant === "home" ? { featured: true } : {}),
      },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: limit ?? (variant === "home" ? 8 : 60),
    });
  } catch {
    return null;
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="portfolio-title"
      className="border-t border-line bg-bone-soft py-16 lg:py-24"
    >
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Trabajos realizados
            </p>
            <h2
              id="portfolio-title"
              className="mt-2 max-w-2xl font-display text-section font-semibold text-ink"
            >
              {variant === "home"
                ? "Algunos pedidos que ya hemos producido."
                : "Galería completa de trabajos realizados"}
            </h2>
            {variant === "home" && (
              <p className="mt-3 max-w-xl text-base text-ink/65">
                Empresas, eventos y campañas que confiaron en nosotros para producir su
                merchandising con impacto.
              </p>
            )}
          </div>
          {variant === "home" && (
            <Link
              href="/trabajos"
              className="text-sm font-medium text-accent hover:underline"
            >
              Ver todos los trabajos →
            </Link>
          )}
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
          {items.map((it) => {
            const inner = (
              <>
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-bone">
                  <Image
                    src={it.imageUrl}
                    alt={it.title}
                    fill
                    sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
                    className="object-cover transition group-hover:scale-105"
                    unoptimized
                  />
                  {it.sector && (
                    <span className="absolute left-2 top-2 rounded-full bg-bone/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink/70 backdrop-blur">
                      {it.sector}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <p className="line-clamp-1 font-medium text-ink">{it.title}</p>
                  {it.clientName && (
                    <p className="text-xs text-ink/50">{it.clientName}</p>
                  )}
                </div>
              </>
            );

            return (
              <li key={it.id}>
                {it.productSlug ? (
                  <Link
                    href={`/catalogo/${it.productSlug}`}
                    className="group block"
                    title={`Ver producto: ${it.title}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="group">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
