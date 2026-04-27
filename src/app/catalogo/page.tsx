import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Catálogo de merchandising personalizable",
  description:
    "Más de 2.000 productos promocionales personalizables: textil, drinkware, escritura, tecnología, eventos. Producción con impacto social en Centros Especiales de Empleo y talleres locales.",
};

export const revalidate = 3600; // 1h ISR

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const catSlug = (sp.cat || "").trim();
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const perPage = 24;

  const category = catSlug
    ? await prisma.category.findUnique({ where: { slug: catSlug } })
    : null;

  const where = {
    active: true,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(category ? { categoryId: category.id } : {}),
  };

  const [products, total, topCategories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        primaryImageUrl: true,
        category: { select: { name: true } },
      },
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({
      where: { level: 1 },
      orderBy: { name: "asc" },
      select: { slug: true, name: true, _count: { select: { products: true } } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <>
      <Nav />
      <main className="bg-bone">
        <section className="border-b border-ink/10 bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-accent">
              Catálogo
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              {category ? category.name : "Más de 2.000 productos personalizables"}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Cualquier producto se personaliza con tu logo y se produce en CEE o talleres
              locales. Pídelo por categoría o busca lo que necesites.
            </p>

            <form className="mt-8 flex max-w-xl gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar productos…"
                className="flex-1 rounded-full border border-ink/15 bg-bone-soft px-5 py-3 text-base outline-none transition focus:border-accent"
              />
              {catSlug && <input type="hidden" name="cat" value={catSlug} />}
              <button
                type="submit"
                className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone hover:bg-accent"
              >
                Buscar
              </button>
            </form>
          </div>
        </section>

        <section className="bg-bone py-10">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/catalogo"
                className={`rounded-full px-4 py-1.5 text-sm transition ${
                  !catSlug
                    ? "bg-ink text-bone"
                    : "border border-ink/15 bg-bone-soft text-ink/70 hover:border-ink/40"
                }`}
              >
                Todas
              </Link>
              {topCategories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/catalogo?cat=${c.slug}`}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${
                    catSlug === c.slug
                      ? "bg-ink text-bone"
                      : "border border-ink/15 bg-bone-soft text-ink/70 hover:border-ink/40"
                  }`}
                >
                  {c.name}{" "}
                  <span className="text-xs opacity-60">({c._count.products})</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-bone pb-24 pt-4 lg:pb-36">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            {total === 0 ? (
              <EmptyState q={q} />
            ) : (
              <>
                <p className="mb-8 text-sm text-ink/60">
                  {total.toLocaleString("es-ES")} productos
                  {q && (
                    <>
                      {" "}
                      para «<strong>{q}</strong>»
                    </>
                  )}
                </p>
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/catalogo/${p.slug}`}
                      className="group flex flex-col rounded-3xl border border-ink/10 bg-bone-soft p-5 transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
                    >
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-bone">
                        {p.primaryImageUrl ? (
                          <Image
                            src={p.primaryImageUrl}
                            alt={p.name}
                            fill
                            sizes="(max-width:768px) 50vw, 25vw"
                            className="object-contain p-4 transition group-hover:scale-105"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-ink/30">Sin imagen</div>
                        )}
                      </div>
                      <h3 className="mt-5 font-display text-lg font-semibold text-ink line-clamp-2">
                        {p.name}
                      </h3>
                      {p.category?.name && (
                        <p className="mt-1 text-xs uppercase tracking-wider text-ink/50">
                          {p.category.name}
                        </p>
                      )}
                      <span className="mt-auto pt-4 text-xs font-medium text-accent">
                        Ver y cotizar →
                      </span>
                    </Link>
                  ))}
                </div>

                <Pagination page={page} totalPages={totalPages} q={q} cat={catSlug} />
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-ink/15 bg-bone-soft p-16 text-center">
      <p className="font-display text-2xl font-semibold text-ink">
        {q ? `Nada para «${q}» todavía.` : "Catálogo aún sincronizando."}
      </p>
      <p className="mx-auto mt-3 max-w-md text-ink/60">
        El sync nocturno tarda en completarse la primera vez. Mientras tanto, cuéntanos
        qué buscas y lo cotizamos directamente.
      </p>
      <Link
        href="/#cotizar"
        className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-bone transition hover:bg-accent"
      >
        Pedir cotización
      </Link>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  q,
  cat,
}: {
  page: number;
  totalPages: number;
  q: string;
  cat: string;
}) {
  if (totalPages <= 1) return null;
  function url(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    params.set("page", String(p));
    return `/catalogo?${params.toString()}`;
  }
  return (
    <div className="mt-16 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link
          href={url(page - 1)}
          className="rounded-full border border-ink/15 px-5 py-2 hover:border-ink/40"
        >
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="text-ink/60">
        Página {page} de {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={url(page + 1)}
          className="rounded-full border border-ink/15 px-5 py-2 hover:border-ink/40"
        >
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
