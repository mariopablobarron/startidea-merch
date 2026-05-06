import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { SortSelect } from "@/components/SortSelect";
import { CompareBadge } from "@/components/CatalogCardActions";

export const metadata: Metadata = {
  title: "Catálogo de merchandising personalizable",
  description:
    "Más de 2.000 productos promocionales personalizables: textil, drinkware, escritura, tecnología, eventos. Producción con impacto social en Centros Especiales de Empleo y talleres locales.",
};

export const revalidate = 3600;

type Sort = "name" | "stock" | "recent";
const SORT_LABELS: Record<Sort, string> = {
  name: "Nombre A–Z",
  stock: "Más stock primero",
  recent: "Sincronizados recientemente",
};

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; color?: string; mat?: string; page?: string; sort?: Sort }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const catSlug = (sp.cat || "").trim();
  const colorGroup = (sp.color || "").trim();
  const material = (sp.mat || "").trim();
  const sort: Sort = (sp.sort as Sort) || "name";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const perPage = 24;

  // Resolve category — puede ser top-level o sub-categoría (level 2/3)
  const category = catSlug
    ? await prisma.category.findFirst({ where: { slug: catSlug } })
    : null;

  // Construir lista de IDs descendientes para que filtrar por una categoría top
  // incluya productos asignados a sus subcategorías.
  let categoryIds: string[] | undefined;
  if (category) {
    const descendants = await collectDescendants(category.id);
    categoryIds = [category.id, ...descendants];
  }

  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    ...(colorGroup
      ? { variants: { some: { colorGroup: { equals: colorGroup, mode: "insensitive" as const } } } }
      : {}),
    ...(material
      ? { material: { contains: material, mode: "insensitive" as const } }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === "stock"
      ? { variants: { _count: "desc" } }
      : sort === "recent"
        ? { syncedAt: "desc" }
        : { name: "asc" };

  const [products, total, topCategories, subCategories, colorGroups, materials] =
    await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          primaryImageUrl: true,
          category: { select: { name: true } },
          variants: { take: 1, select: { stockQty: true } },
        },
      }),
      prisma.product.count({ where }),
      prisma.category.findMany({
        where: { level: 1 },
        orderBy: { name: "asc" },
      }),
      // Subcategorías (level 2 y 3) del top-level activo
      category
        ? prisma.category.findMany({
            where: { parentId: category.parentId === null ? category.id : category.parentId },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      // Color groups disponibles en el conjunto filtrado.
      // Prisma groupBy con relación nested requiere `is:`
      prisma.productVariant.groupBy({
        by: ["colorGroup"],
        where: { product: { is: where }, colorGroup: { not: null } },
        _count: { _all: true },
        orderBy: { colorGroup: "asc" },
        take: 12,
      }),
      // Materiales más comunes
      prisma.product.groupBy({
        by: ["material"],
        where: { ...where, material: { not: null } },
        _count: { _all: true },
        orderBy: { material: "asc" },
        take: 12,
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <>
      <Nav />
      <main className="bg-bone">
        <section className="border-b border-line bg-bone py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-accent">
              Catálogo
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              {category ? category.name : "Más de 2.000 productos personalizables"}
            </h1>
            <p className="mt-4 max-w-3xl text-base text-ink/70 lg:text-lg">
              Cualquier producto se personaliza con tu logo y se produce en CEE o talleres
              locales. Pídelo por categoría o busca lo que necesites.
            </p>

            <form className="mt-6 flex max-w-xl gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Buscar productos…"
                className="flex-1 rounded-full border border-line bg-bone-soft px-5 py-3 text-base outline-none transition focus:border-accent"
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

        {/* Subcategorías chips dentro de una categoría seleccionada */}
        {subCategories.length > 0 && (
          <section className="border-b border-line bg-bone-soft py-5">
            <div className="mx-auto max-w-8xl px-6 lg:px-10">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/catalogo?cat=${category?.parentId ? "" : catSlug}`}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    !category?.parentId ? "bg-ink text-bone" : "border border-line bg-bone text-ink/70 hover:border-accent"
                  }`}
                >
                  Todas
                </Link>
                {subCategories.map((sc) => (
                  <Link
                    key={sc.id}
                    href={`/catalogo?cat=${sc.slug}`}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      catSlug === sc.slug
                        ? "bg-ink text-bone"
                        : "border border-line bg-bone text-ink/70 hover:border-accent"
                    }`}
                  >
                    {sc.name}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-bone py-10 lg:py-12">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <div className="grid gap-10 lg:grid-cols-[260px,1fr]">
              {/* Sidebar filtros */}
              <aside className="lg:sticky lg:top-24 lg:self-start">
                <FilterBlock title="Categoría">
                  <Chip href="/catalogo" active={!catSlug} label="Todas" />
                  {topCategories.map((c) => (
                    <Chip
                      key={c.id}
                      href={`/catalogo?cat=${c.slug}`}
                      active={catSlug === c.slug}
                      label={c.name}
                    />
                  ))}
                </FilterBlock>

                {colorGroups.length > 0 && (
                  <FilterBlock title="Color">
                    <Chip
                      href={buildHref({ q, cat: catSlug, mat: material, sort })}
                      active={!colorGroup}
                      label="Cualquiera"
                    />
                    {colorGroups
                      .filter((c) => c.colorGroup)
                      .map((c) => (
                        <Chip
                          key={c.colorGroup!}
                          href={buildHref({
                            q,
                            cat: catSlug,
                            mat: material,
                            color: c.colorGroup!,
                            sort,
                          })}
                          active={colorGroup.toLowerCase() === c.colorGroup!.toLowerCase()}
                          label={`${c.colorGroup}`}
                        />
                      ))}
                  </FilterBlock>
                )}

                {materials.length > 0 && (
                  <FilterBlock title="Material">
                    <Chip
                      href={buildHref({ q, cat: catSlug, color: colorGroup, sort })}
                      active={!material}
                      label="Cualquiera"
                    />
                    {materials
                      .filter((m) => m.material)
                      .slice(0, 8)
                      .map((m) => (
                        <Chip
                          key={m.material!}
                          href={buildHref({
                            q,
                            cat: catSlug,
                            color: colorGroup,
                            mat: m.material!,
                            sort,
                          })}
                          active={material.toLowerCase() === m.material!.toLowerCase()}
                          label={m.material!}
                        />
                      ))}
                  </FilterBlock>
                )}

                {(q || catSlug || colorGroup || material) && (
                  <Link
                    href="/catalogo"
                    className="mt-6 inline-block text-xs text-ink/60 underline-offset-4 hover:text-accent hover:underline"
                  >
                    Limpiar filtros
                  </Link>
                )}
              </aside>

              {/* Grid de productos */}
              <div>
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="text-ink/60">
                    {total.toLocaleString("es-ES")} {total === 1 ? "producto" : "productos"}
                    {q && (
                      <>
                        {" "}
                        para «<strong>{q}</strong>»
                      </>
                    )}
                  </p>
                  <SortSelect current={sort} q={q} cat={catSlug} color={colorGroup} mat={material} />
                </div>

                {total === 0 ? (
                  <EmptyState q={q} />
                ) : (
                  <>
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                      {products.map((p) => {
                        const stock = p.variants[0]?.stockQty ?? 0;
                        return (
                          <Link
                            key={p.id}
                            href={`/catalogo/${p.slug}`}
                            className="group flex flex-col rounded-3xl border border-line bg-bone-soft p-5 transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
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
                              <CompareBadge slug={p.slug} />
                            </div>
                            <h3 className="mt-5 line-clamp-2 font-display text-lg font-semibold text-ink">
                              {p.name}
                            </h3>
                            {p.category?.name && (
                              <p className="mt-1 text-[11px] uppercase tracking-wider text-ink/50">
                                {p.category.name}
                              </p>
                            )}
                            <div className="mt-4 flex items-center justify-between text-xs">
                              {stock > 0 ? (
                                <span className="inline-flex items-center gap-1.5 text-social">
                                  <span className="h-1.5 w-1.5 rounded-full bg-social" />
                                  En stock
                                </span>
                              ) : (
                                <span className="text-ink/40">Bajo pedido</span>
                              )}
                              <span className="font-medium text-accent">Ver →</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>

                    <Pagination page={page} totalPages={totalPages} q={q} cat={catSlug} color={colorGroup} mat={material} sort={sort} />
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}

async function collectDescendants(rootId: string): Promise<string[]> {
  const ids: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const childIds = children.map((c) => c.id);
    if (!childIds.length) break;
    ids.push(...childIds);
    frontier = childIds;
  }
  return ids;
}

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const q = sp.toString();
  return `/catalogo${q ? `?${q}` : ""}`;
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-5 first:pt-0 last:border-b-0">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink/50">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs transition ${
        active
          ? "bg-ink text-bone"
          : "border border-line bg-bone-soft text-ink/70 hover:border-accent"
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-bone-soft p-16 text-center">
      <p className="font-display text-2xl font-semibold text-ink">
        {q ? `Nada para «${q}» todavía.` : "Catálogo aún sincronizando."}
      </p>
      <p className="mx-auto mt-3 max-w-md text-ink/60">
        Cuéntanos qué buscas y lo cotizamos directamente en 24h.
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
  color,
  mat,
  sort,
}: {
  page: number;
  totalPages: number;
  q: string;
  cat: string;
  color: string;
  mat: string;
  sort: Sort;
}) {
  if (totalPages <= 1) return null;
  function url(p: number) {
    return buildHref({ q, cat, color, mat, sort, page: String(p) });
  }
  return (
    <div className="mt-12 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link
          href={url(page - 1)}
          className="rounded-full border border-line px-5 py-2 hover:border-accent"
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
          className="rounded-full border border-line px-5 py-2 hover:border-accent"
        >
          Siguiente →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
