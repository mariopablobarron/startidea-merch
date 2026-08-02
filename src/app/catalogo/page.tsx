import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { BannerSlot } from "@/components/BannerSlot";
import { JsonLd } from "@/components/JsonLd";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { publicRef } from "@/lib/internal-ref";
import { proxyImageUrl, absoluteProxyImageUrl } from "@/lib/proxy-image";
import { collectionPageJsonLd } from "@/lib/jsonld";
import { SortSelect } from "@/components/SortSelect";
import { CompareBadge } from "@/components/CatalogCardActions";
import { FavoriteHeart } from "@/components/portal/FavoriteHeart";
import { CatalogFiltersDisclosure } from "@/components/CatalogFiltersDisclosure";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";
import { marginMultiplier } from "@/lib/pricing";
import { searchProductIdsSafe } from "@/lib/search/meili";
import { loadActivePromotions, getBadgeText } from "@/lib/promotions";
import { displayFromPrice } from "@/lib/product-pricing";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}): Promise<Metadata> {
  const { getPageSeo, mergeMetadata } = await import("@/lib/page-seo");
  const seo = await getPageSeo("/catalogo");
  const merged = mergeMetadata(BASE_METADATA, seo);
  // Vista filtrada por categoría → canonical a la landing limpia /categorias/{cat}
  // para consolidar autoridad y evitar contenido duplicado por query params.
  const cat = ((await searchParams).cat || "").trim();
  if (cat) {
    return {
      ...merged,
      alternates: {
        ...(merged.alternates || {}),
        canonical: `${SITE_URL}/categorias/${cat}`,
      },
    };
  }
  return merged;
}

const BASE_METADATA: Metadata = {
  title: "Catálogo de merchandising personalizable",
  description:
    "Más de 9.000 productos promocionales personalizables: textil, drinkware, escritura, tecnología, eventos. Producción con impacto social en Centros Especiales de Empleo y talleres locales.",
  alternates: { canonical: "https://merchandising.startidea.es/catalogo" },
};

export const revalidate = 3600;

type Sort = "name" | "stock" | "recent";
const SORT_LABELS: Record<Sort, string> = {
  name: "Nombre A–Z",
  stock: "Más stock primero",
  recent: "Sincronizados recientemente",
};

// Orden fijo de tallas (no alfabético: "XL" < "XS" rompería el orden natural).
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cat?: string;
    color?: string;
    talla?: string;
    mat?: string;
    page?: string;
    sort?: Sort;
    priceMin?: string; // €
    priceMax?: string; // €
    stock?: string; // "1" → solo en stock
  }>;
}) {
  const sp = await searchParams;
  const qRaw = (sp.q || "").trim();
  const q = normalizeSearch(qRaw);
  const catSlug = (sp.cat || "").trim();
  const colorGroup = (sp.color || "").trim();
  const talla = (sp.talla || "").trim();
  const material = (sp.mat || "").trim();
  const priceMin = sp.priceMin ? Math.max(0, parseInt(sp.priceMin, 10) || 0) : null;
  const priceMax = sp.priceMax ? Math.max(0, parseInt(sp.priceMax, 10) || 0) : null;
  const inStock = sp.stock === "1";
  const sort: Sort = (sp.sort as Sort) || "name";
  // ¿El usuario ELIGIÓ orden? Si no, con búsqueda activa mandará la relevancia
  // de Meili en vez del alfabético (que enterraba el mejor resultado).
  const sortExplicit = Boolean(sp.sort);
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const perPage = 24;
  const activeFilterCount = [
    Boolean(qRaw),
    Boolean(catSlug),
    Boolean(colorGroup),
    Boolean(talla),
    Boolean(material),
    priceMin !== null,
    priceMax !== null,
    inStock,
  ].filter(Boolean).length;

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

  // Búsqueda por campos de ALTA SEÑAL: nombre, descripción corta, tags y
  // categoría. Antes incluía longDescription/material, que metían falsos
  // positivos (p.ej. "camiseta" devolvía una bolsa de agua cuya descripción
  // larga la mencionaba). El material se filtra aparte. Mario 2026-06-16.
  const searchTerms = q ? q.split(/\s+/).filter((w) => w.length > 2) : [];
  // Motor principal: Meilisearch (erratas + relevancia) → lista de IDs que se
  // inyecta al pipeline Prisma, así TODOS los filtros (color/talla/precio/
  // stock) y ordenaciones siguen funcionando igual. null = Meili caído o sin
  // configurar → fallback al contains de siempre. [] = "de verdad no hay nada".
  const meiliIds = searchTerms.length > 0 ? await searchProductIdsSafe(qRaw) : null;
  const searchClause: Prisma.ProductWhereInput | undefined =
    meiliIds !== null
      ? { id: { in: meiliIds } }
      : searchTerms.length > 0
        ? {
            AND: searchTerms.map((term) => ({
              OR: [
                { name: { contains: term, mode: "insensitive" as const } },
                { shortDescription: { contains: term, mode: "insensitive" as const } },
                { tags: { has: term.toLowerCase() } },
                { category: { name: { contains: term, mode: "insensitive" as const } } },
              ],
            })),
          }
        : undefined;

  // Price filter: el usuario filtra en precio CLIENTE (€ con margen). Para
  // override.customFromPriceCents (ya es precio cliente) comparamos directo;
  // para fromPriceCents (NETO) escalamos los límites a espacio neto dividiendo
  // por el margen, ya que la web muestra ese neto × margen.
  const m = marginMultiplier();
  const netMin = priceMin !== null ? Math.floor((priceMin * 100) / m) : null;
  const netMax = priceMax !== null ? Math.ceil((priceMax * 100) / m) : null;
  const priceFilter: Prisma.ProductWhereInput | undefined =
    priceMin !== null || priceMax !== null
      ? {
          OR: [
            // Producto con override de precio (customFromPriceCents ya es cliente)
            {
              override: {
                is: {
                  customFromPriceCents: {
                    ...(priceMin !== null ? { gte: priceMin * 100 } : {}),
                    ...(priceMax !== null ? { lte: priceMax * 100 } : {}),
                  },
                },
              },
            },
            // Producto sin override, usar fromPriceCents (neto → escalado por margen)
            {
              AND: [
                { override: null },
                {
                  fromPriceCents: {
                    ...(netMin !== null ? { gte: netMin } : {}),
                    ...(netMax !== null ? { lte: netMax } : {}),
                  },
                },
              ],
            },
          ],
        }
      : undefined;

  // Filtro de variantes: color, talla y stock deben viajar en UN único
  // `variants.some`, porque son claves del mismo objeto `where` — si se
  // spreadean por separado (como antes con colorGroup y stockFilter en
  // objetos distintos), la última en el spread pisa a las anteriores y
  // el filtro previo deja de aplicarse en silencio.
  const variantsFilter: Prisma.ProductWhereInput | undefined =
    colorGroup || talla || inStock
      ? {
          variants: {
            some: {
              ...(talla ? { size: talla } : {}),
              ...(colorGroup
                ? { colorGroup: { equals: colorGroup, mode: "insensitive" as const } }
                : {}),
              ...(inStock ? { stockQty: { gt: 0 } } : {}),
            },
          },
        }
      : undefined;

  const where: Prisma.ProductWhereInput = {
    active: true,
    NOT: { override: { is: { hidden: true } } },
    ...(searchClause ? searchClause : {}),
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    ...(material
      ? { material: { contains: material, mode: "insensitive" as const } }
      : {}),
    ...(priceFilter || {}),
    ...(variantsFilter || {}),
  };

  // Productos destacados (override.featured = true) siempre primero,
  // luego el sort elegido por el usuario.
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = [
    { override: { featured: "desc" } },
    sort === "stock"
      ? { variants: { _count: "desc" } }
      : sort === "recent"
        ? { syncedAt: "desc" }
        : { name: "asc" },
  ];

  // ORDEN POR RELEVANCIA: con búsqueda Meili activa y sin sort explícito del
  // usuario, se pagina sobre los IDs en el orden que los rankeó Meili (los
  // filtros color/talla/precio ya aplicaron vía `where`). Dos queries baratas:
  // ids filtrados (≤600) + los 24 de la página.
  const relevanceSort = meiliIds !== null && !sortExplicit;
  let pageIds: string[] | null = null;
  if (relevanceSort) {
    const idRows = await prisma.product.findMany({ where, select: { id: true } });
    const rank = new Map(meiliIds!.map((id, i) => [id, i] as const));
    const rankedIds = idRows
      .map((r) => r.id)
      .sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
    pageIds = rankedIds.slice((page - 1) * perPage, page * perPage);
  }

  const [products, total, topCategories, subCategories, colorGroups, sizes, materials, activePromos] =
    await Promise.all([
      prisma.product.findMany({
        // Con relevancia: la página ya viene resuelta en pageIds (orden Meili);
        // sin ella, paginación SQL clásica.
        where: pageIds ? { id: { in: pageIds } } : where,
        orderBy,
        ...(pageIds ? {} : { skip: (page - 1) * perPage, take: perPage }),
        select: {
          id: true,
          slug: true,
          name: true,
          brand: true,
          internalRef: true,
          primaryImageUrl: true,
          fromPriceCents: true,
          categoryId: true,
          category: { select: { name: true } },
          // Presencia de stock: ¿hay ALGUNA variante con unidades? (antes miraba
          // solo la primera variante arbitraria → marcaba "bajo pedido" productos
          // que sí tenían stock en otro color/talla).
          variants: { where: { stockQty: { gt: 0 } }, take: 1, select: { id: true } },
          override: {
            select: {
              customName: true,
              customFromPriceCents: true,
              marginPct: true,
              featured: true,
              marketingTags: true,
            },
          },
        },
      }),
      prisma.product.count({ where }),
      // Top-level categories con count de productos activos por cada una.
      // Filtramos las que tienen al menos 1 producto activo (directo o en subcategorías
      // hasta level 3) para evitar que el panel muestre categorías vacías.
      prisma.category.findMany({
        where: {
          level: 1,
          OR: [
            { products: { some: { active: true } } },
            { children: { some: { products: { some: { active: true } } } } },
            { children: { some: { children: { some: { products: { some: { active: true } } } } } } },
          ],
        },
        orderBy: { name: "asc" },
        include: { _count: { select: { products: { where: { active: true } } } } },
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
      // Tallas disponibles en el conjunto filtrado (textiles principalmente;
      // null en productos sin talla, se excluyen del groupBy).
      prisma.productVariant.groupBy({
        by: ["size"],
        where: { product: { is: where }, size: { not: null } },
        _count: { _all: true },
      }),
      // Materiales más comunes
      prisma.product.groupBy({
        by: ["material"],
        where: { ...where, material: { not: null } },
        _count: { _all: true },
        orderBy: { material: "asc" },
        take: 12,
      }),
      // Promociones activas — se aplican a card price + badge
      loadActivePromotions(),
    ]);

  // Fallback inteligente: si el usuario buscó algo (q) y NO hay resultados,
  // intentamos llevarle a una categoría que matchee. Ej: busca "camisetas",
  // 0 productos en name → redirige a /catalogo?cat=camisetas-personalizadas.
  if (total === 0 && searchTerms.length > 0 && !catSlug && page === 1) {
    const matchedCategory = await prisma.category.findFirst({
      where: {
        OR: searchTerms.map((term) => ({
          OR: [
            { name: { contains: term, mode: "insensitive" as const } },
            { slug: { contains: term, mode: "insensitive" as const } },
          ],
        })),
      },
      orderBy: { level: "asc" }, // preferir top-level
      select: { slug: true, name: true },
    });
    if (matchedCategory) {
      const params = new URLSearchParams({ cat: matchedCategory.slug });
      // Conservamos el q original como hint visual, pero el filtro real es por categoría
      if (qRaw) params.set("q", qRaw);
      redirect(`/catalogo?${params.toString()}`);
    }
  }

  // La query con {id:{in:pageIds}} devuelve en orden arbitrario → restaurar
  // el orden de relevancia de Meili.
  if (pageIds) {
    const pos = new Map(pageIds.map((id, i) => [id, i] as const));
    products.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Ordenar tallas disponibles según SIZE_ORDER (no alfabético). Tallas fuera
  // de la lista fija (raras en el feed proveedor) se añaden al final A–Z.
  const availableSizes = sizes
    .map((s) => s.size)
    .filter((s): s is string => !!s)
    .sort((a, b) => {
      const ia = SIZE_ORDER.indexOf(a);
      const ib = SIZE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  // Sidebar de categorías: hay cientos de categorías top-level (feed de
  // proveedores). Mostrar las ~14 con más productos (las relevantes) + un
  // "Ver todas" al hub /categorias. La activa siempre se muestra aunque esté
  // en la cola larga, para que el usuario vea/quite su selección.
  const TOP_CATS = 14;
  const sortedTopCats = [...topCategories].sort(
    (a, b) => (b._count?.products ?? 0) - (a._count?.products ?? 0),
  );
  let displayCats = sortedTopCats.slice(0, TOP_CATS);
  if (catSlug && !displayCats.some((c) => c.slug === catSlug)) {
    const act = sortedTopCats.find((c) => c.slug === catSlug);
    if (act) displayCats = [act, ...displayCats.slice(0, TOP_CATS - 1)];
  }

  // CollectionPage JSON-LD: Google entiende la página como índice de
  // items y puede mostrar sitelinks más ricos. Solo primeros 24 items
  // (los visibles) — más sería verboso para el crawler.
  const collectionSchema = collectionPageJsonLd({
    name: category ? `${category.name} · TodoMerchandising` : "Catálogo · TodoMerchandising",
    description: category
      ? `Productos de la categoría ${category.name}: personalizables con tu logo y producción con impacto social.`
      : "Más de 9.000 productos promocionales personalizables con producción en Centros Especiales de Empleo.",
    url: `${SITE_URL}/catalogo${catSlug ? `?cat=${catSlug}` : ""}`,
    items: products.slice(0, 24).map((p) => ({
      name: p.override?.customName || p.name,
      url: `${SITE_URL}/catalogo/${p.slug}`,
      image: absoluteProxyImageUrl(p.primaryImageUrl),
    })),
  });

  return (
    <>
      <JsonLd data={collectionSchema as never} />
      <Nav />
      <BannerSlot slot="CATALOGO_TOP" />
      <main className="bg-bone">
        <section className="border-b border-line bg-bone py-8 lg:py-10">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Catálogo
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              {category ? category.name : "Más de 9.000 productos personalizables"}
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
                aria-label="Buscar productos en el catálogo"
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

            <p className="mt-4 text-sm text-ink/60">
              ¿No sabes cuál elegir?{" "}
              <Link
                href="/recomendador"
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                Cuéntale a nuestro asistente IA lo que necesitas
              </Link>{" "}
              y te recomienda productos y un presupuesto al instante.
            </p>
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

        <section className="bg-bone py-6 lg:py-8">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[240px,1fr]">
              {/* En móvil los filtros permanecen plegados para que el primer
                  producto aparezca enseguida. En escritorio siguen sticky. */}
              <CatalogFiltersDisclosure activeCount={activeFilterCount}>
                <FilterBlock title="Categoría">
                  <Chip
                    href="/catalogo"
                    active={!catSlug}
                    label={`Todas (${total.toLocaleString("es-ES")})`}
                  />
                  {displayCats.map((c) => (
                    <Chip
                      key={c.id}
                      href={`/catalogo?cat=${c.slug}`}
                      active={catSlug === c.slug}
                      title={c.name}
                      label={`${shortLabel(c.name)}${c._count?.products ? ` (${c._count.products})` : ""}`}
                    />
                  ))}
                  <div className="mt-2 border-t border-line pt-2">
                    <Chip
                      href="/categorias"
                      active={false}
                      label={`Ver todas las categorías (${topCategories.length})`}
                    />
                    <Chip
                      href="/promociones"
                      active={false}
                      label="★ Promociones y novedades"
                    />
                  </div>
                </FilterBlock>

                <FilterBlock title="Talla">
                  <Chip
                    href={buildHref({
                      q: qRaw,
                      cat: catSlug,
                      color: colorGroup,
                      mat: material,
                      sort,
                      priceMin: priceMin?.toString(),
                      priceMax: priceMax?.toString(),
                      stock: inStock ? "1" : undefined,
                    })}
                    active={!talla}
                    label="Cualquiera"
                  />
                  {SIZE_ORDER.filter((s) => availableSizes.includes(s)).map((s) => (
                    <Chip
                      key={s}
                      href={buildHref({
                        q: qRaw,
                        cat: catSlug,
                        color: colorGroup,
                        talla: s,
                        mat: material,
                        sort,
                        priceMin: priceMin?.toString(),
                        priceMax: priceMax?.toString(),
                        stock: inStock ? "1" : undefined,
                      })}
                      active={talla === s}
                      label={s}
                    />
                  ))}
                </FilterBlock>

                {colorGroups.length > 0 && (
                  <FilterBlock title="Color">
                    <Chip
                      href={buildHref({
                        q: qRaw,
                        cat: catSlug,
                        talla,
                        mat: material,
                        sort,
                        priceMin: priceMin?.toString(),
                        priceMax: priceMax?.toString(),
                        stock: inStock ? "1" : undefined,
                      })}
                      active={!colorGroup}
                      label="Cualquiera"
                    />
                    {colorGroups
                      .filter((c) => c.colorGroup)
                      .map((c) => (
                        <Chip
                          key={c.colorGroup!}
                          href={buildHref({
                            q: qRaw,
                            cat: catSlug,
                            talla,
                            mat: material,
                            color: c.colorGroup!,
                            sort,
                            priceMin: priceMin?.toString(),
                            priceMax: priceMax?.toString(),
                            stock: inStock ? "1" : undefined,
                          })}
                          active={colorGroup.toLowerCase() === c.colorGroup!.toLowerCase()}
                          // colorGroup se almacena canónico en minúsculas (azul,
                          // marron…) → capitalizamos solo para mostrar el chip.
                          label={c.colorGroup!.charAt(0).toUpperCase() + c.colorGroup!.slice(1)}
                        />
                      ))}
                  </FilterBlock>
                )}

                {materials.length > 0 && (
                  <FilterBlock title="Material">
                    <Chip
                      href={buildHref({
                        q: qRaw,
                        cat: catSlug,
                        color: colorGroup,
                        talla,
                        sort,
                        priceMin: priceMin?.toString(),
                        priceMax: priceMax?.toString(),
                        stock: inStock ? "1" : undefined,
                      })}
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
                            q: qRaw,
                            cat: catSlug,
                            color: colorGroup,
                            talla,
                            mat: m.material!,
                            sort,
                            priceMin: priceMin?.toString(),
                            priceMax: priceMax?.toString(),
                            stock: inStock ? "1" : undefined,
                          })}
                          active={material.toLowerCase() === m.material!.toLowerCase()}
                          label={m.material!}
                        />
                      ))}
                  </FilterBlock>
                )}

                {/* Rango de precio */}
                <FilterBlock title="Rango de precio (€/ud)">
                  <form method="get" action="/catalogo" className="space-y-2">
                    {q && <input type="hidden" name="q" value={qRaw} />}
                    {catSlug && <input type="hidden" name="cat" value={catSlug} />}
                    {colorGroup && <input type="hidden" name="color" value={colorGroup} />}
                    {talla && <input type="hidden" name="talla" value={talla} />}
                    {material && <input type="hidden" name="mat" value={material} />}
                    {sort && <input type="hidden" name="sort" value={sort} />}
                    {inStock && <input type="hidden" name="stock" value="1" />}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="priceMin"
                        defaultValue={priceMin ?? ""}
                        min={0}
                        aria-label="Precio mínimo por unidad"
                        placeholder="Desde"
                        className="w-full rounded-lg border border-line bg-bone-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                      />
                      <span className="text-xs text-ink/40">—</span>
                      <input
                        type="number"
                        name="priceMax"
                        defaultValue={priceMax ?? ""}
                        min={0}
                        aria-label="Precio máximo por unidad"
                        placeholder="Hasta"
                        className="w-full rounded-lg border border-line bg-bone-soft px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-bone hover:bg-accent"
                    >
                      Aplicar precio
                    </button>
                  </form>
                </FilterBlock>

                {/* Disponibilidad / Stock */}
                <FilterBlock title="Disponibilidad">
                  <Chip
                    href={buildHref({
                      q: qRaw,
                      cat: catSlug,
                      color: colorGroup,
                      talla,
                      mat: material,
                      sort,
                      priceMin: priceMin?.toString(),
                      priceMax: priceMax?.toString(),
                    })}
                    active={!inStock}
                    label="Todos"
                  />
                  <Chip
                    href={buildHref({
                      q: qRaw,
                      cat: catSlug,
                      color: colorGroup,
                      talla,
                      mat: material,
                      sort,
                      stock: "1",
                      priceMin: priceMin?.toString(),
                      priceMax: priceMax?.toString(),
                    })}
                    active={inStock}
                    label="✓ Solo en stock"
                  />
                </FilterBlock>

                {(q || catSlug || colorGroup || talla || material || priceMin !== null || priceMax !== null || inStock) && (
                  <Link
                    href="/catalogo"
                    className="mt-6 inline-block text-xs text-ink/60 underline-offset-4 hover:text-accent hover:underline"
                  >
                    Limpiar todos los filtros
                  </Link>
                )}
              </CatalogFiltersDisclosure>

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
                  <SortSelect current={sort} q={q} cat={catSlug} color={colorGroup} talla={talla} mat={material} />
                </div>

                {total === 0 ? (
                  <EmptyState q={q} />
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 lg:gap-5">
                      {products.map((p) => {
                        const inStock = p.variants.length > 0;
                        // Aplicar overrides admin si existen
                        const ov = p.override;
                        const displayName = ov?.customName || p.name;
                        // Precio "desde" cliente (neto → margen/override → PERCENT).
                        // FIXED no toca el "desde" (es descuento de pedido) pero sí
                        // aparece como badge. Misma fuente que ficha y carrito.
                        const priceInfo = displayFromPrice(
                          {
                            id: p.id,
                            name: p.name,
                            brand: p.brand,
                            categoryId: p.categoryId,
                            fromPriceCents: p.fromPriceCents,
                          },
                          ov
                            ? {
                                customFromPriceCents: ov.customFromPriceCents,
                                marginPct: ov.marginPct,
                                marketingTags: ov.marketingTags,
                              }
                            : null,
                          activePromos,
                        );
                        const basePriceCents = priceInfo.originalCents;
                        const displayPriceCents = priceInfo.finalCents;
                        const hasPromo = priceInfo.hasPromo;
                        const badgePromo = priceInfo.badgePromo;
                        const isFeatured = ov?.featured ?? false;
                        const tags = ov?.marketingTags ?? [];

                        return (
                          <article
                            key={p.id}
                            className="group relative flex flex-col rounded-3xl border border-line bg-bone-soft transition hover:border-accent/40"
                          >
                            <Link
                              href={`/catalogo/${p.slug}`}
                              className="relative flex h-full flex-col rounded-[inherit] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 lg:p-4"
                            >
                            {/* Badges de marketing arriba a la izquierda */}
                            {(isFeatured || tags.length > 0 || hasPromo) && (
                              <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1">
                                {hasPromo && badgePromo && (
                                  <span
                                    className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone shadow"
                                    style={{
                                      background: badgePromo.badgeColor || "#E63E73",
                                    }}
                                  >
                                    {getBadgeText(badgePromo)}
                                  </span>
                                )}
                                {isFeatured && (
                                  <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone shadow">
                                    ★ Destacado
                                  </span>
                                )}
                                {tags.slice(0, 2).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-full bg-social/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-bone shadow"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="relative aspect-square overflow-hidden rounded-2xl bg-bone">
                              {proxyImageUrl(p.primaryImageUrl) ? (
                                <Image
                                  src={proxyImageUrl(p.primaryImageUrl)!}
                                  alt={displayName}
                                  fill
                                  sizes="(max-width:768px) 50vw, 25vw"
                                  className="object-contain p-2 transition group-hover:scale-105"
                                  unoptimized
                                />
                              ) : (
                                <div className="grid h-full place-items-center text-ink/30">Sin imagen</div>
                              )}
                            </div>
                            <h3 className="mt-3 line-clamp-2 font-display text-base font-semibold text-ink lg:text-lg">
                              {displayName}
                            </h3>
                            <p className="mt-1 flex flex-wrap items-baseline gap-2 text-[11px] uppercase tracking-wider text-ink/50">
                              {p.category?.name && <span>{p.category.name}</span>}
                              <span className="font-mono text-[10px] text-ink/40">
                                {publicRef({ id: p.id, internalRef: p.internalRef })}
                              </span>
                            </p>
                            {/* Precio "desde" — override admin > promo activa > proveedor.
                                Cuando hay promo, mostramos el precio anterior tachado al lado
                                para que el descuento se perciba visualmente. */}
                            {displayPriceCents && displayPriceCents > 0 ? (
                              <p className="mt-3 flex flex-wrap items-baseline gap-1 text-ink">
                                <span className="text-[11px] uppercase tracking-wider text-ink/50">
                                  Desde
                                </span>
                                <span className="font-display text-xl font-semibold text-accent tabular-nums">
                                  {(displayPriceCents / 100).toLocaleString("es-ES", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  €
                                </span>
                                {hasPromo && basePriceCents && basePriceCents > displayPriceCents && (
                                  <span className="font-mono text-[11px] tabular-nums text-ink/40 line-through">
                                    {(basePriceCents / 100).toLocaleString("es-ES", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                    €
                                  </span>
                                )}
                                <span className="text-[11px] text-ink/50">/ud</span>
                              </p>
                            ) : (
                              <p className="mt-3 text-xs text-ink/50">Precio bajo cotización</p>
                            )}
                            <div className="mt-3 flex items-center justify-between text-xs">
                              {inStock ? (
                                <span className="inline-flex items-center gap-1.5 text-social">
                                  <span className="h-1.5 w-1.5 rounded-full bg-social" />
                                  En stock
                                </span>
                              ) : (
                                <span className="text-ink/40">Bajo pedido</span>
                              )}
                              <span className="font-medium text-accent">Personalizar →</span>
                            </div>
                            </Link>
                            {/* Acciones independientes: nunca anidar botones dentro del enlace. */}
                            <div className="absolute right-3 top-3 z-20">
                              <FavoriteHeart productId={p.id} size="sm" />
                            </div>
                            <div className="absolute right-3 top-14 z-20">
                              <CompareBadge slug={p.slug} />
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <Pagination page={page} totalPages={totalPages} q={q} cat={catSlug} color={colorGroup} talla={talla} mat={material} sort={sort} />
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

/**
 * Normaliza el texto de búsqueda: minúsculas, sin acentos, plurales españoles
 * básicos (camisetas → camiseta), quita stopwords. Permite que un usuario
 * que escribe "Quiero camisetas para mi equipo" busque por "camiseta equipo".
 */
function normalizeSearch(raw: string): string {
  if (!raw) return "";
  const stop = new Set([
    "el","la","los","las","un","una","unos","unas","de","del","para","por","con","en","y","o","u",
    "mi","tu","su","es","son","sea","ser","que","como","necesito","quiero","busco","tenemos",
    "tenéis","más","mas","menos","muy","todo","toda","algo","alguna","algun","algún","cualquier",
    "tipo","modelo","marca","producto","productos","empresa","evento","tener","hacer","sobre",
    "este","esta","esto","estos","estas","ese","esa","aquel","aquella","cada","todas","todos",
  ]);
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar acentos
    .replace(/[^\p{L}\d\s]/gu, " ") // quitar puntuación
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
    .map((w) => {
      // Plural español muy básico: -es / -s → singular
      if (w.length > 4 && (w.endsWith("ses") || w.endsWith("ces"))) return w.slice(0, -2);
      if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
      if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
      return w;
    })
    .slice(0, 6) // máximo 6 términos
    .join(" ");
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

function Chip({
  href,
  active,
  label,
  title,
}: {
  href: string;
  active: boolean;
  label: string;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={`inline-flex max-w-full items-center truncate rounded-full px-3 py-1 text-xs transition ${
        active
          ? "bg-ink text-bone"
          : "border border-line bg-bone-soft text-ink/70 hover:border-accent"
      }`}
    >
      {label}
    </Link>
  );
}

/** Acorta nombres de categoría largos para que el chip no rompa el layout. */
function shortLabel(name: string, max = 22): string {
  const clean = name.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function EmptyState({ q }: { q: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-bone-soft p-16 text-center">
      <p className="font-display text-2xl font-semibold text-ink">
        {q ? `Nada para «${q}» todavía.` : "Catálogo aún sincronizando."}
      </p>
      <p className="mx-auto mt-3 max-w-md text-ink/60">
        Cuéntanos qué buscas y te orientamos al catálogo correcto.
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
  talla,
  mat,
  sort,
}: {
  page: number;
  totalPages: number;
  q: string;
  cat: string;
  color: string;
  talla: string;
  mat: string;
  sort: Sort;
}) {
  if (totalPages <= 1) return null;
  function url(p: number) {
    return buildHref({ q, cat, color, talla, mat, sort, page: String(p) });
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
