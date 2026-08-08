import { prisma } from "@/lib/prisma";

export type ResolvedProductSlug<T> = {
  product: T;
  requestedSlug: string;
  canonicalSlug: string;
  redirected: boolean;
};

type RedirectLookup = (oldSlug: string) => Promise<string | null>;
type RedirectsLookup = (oldSlugs: ReadonlyArray<string>) => Promise<Map<string, string>>;

async function lookupRedirect(oldSlug: string): Promise<string | null> {
  const row = await prisma.productSlugRedirect.findUnique({
    where: { oldSlug },
    select: { product: { select: { slug: true } } },
  });
  return row?.product?.slug ?? null;
}

async function lookupRedirects(oldSlugs: ReadonlyArray<string>): Promise<Map<string, string>> {
  if (oldSlugs.length === 0) return new Map();
  const rows = await prisma.productSlugRedirect.findMany({
    where: { oldSlug: { in: [...oldSlugs] } },
    select: { oldSlug: true, product: { select: { slug: true } } },
  });
  return new Map(
    rows.flatMap((row) => (row.product ? [[row.oldSlug, row.product.slug] as const] : [])),
  );
}

/**
 * Resuelve primero el slug vivo exacto y solo después un redirect histórico.
 * El callback conserva el `select`/`include` específico de cada consumidor.
 */
export async function resolveProductBySlug<T>(
  requestedSlug: string,
  findBySlug: (slug: string) => Promise<T | null>,
  findRedirect: RedirectLookup = lookupRedirect,
): Promise<ResolvedProductSlug<T> | null> {
  const direct = await findBySlug(requestedSlug);
  if (direct) {
    return { product: direct, requestedSlug, canonicalSlug: requestedSlug, redirected: false };
  }

  const canonicalSlug = await findRedirect(requestedSlug);
  if (!canonicalSlug || canonicalSlug === requestedSlug) return null;
  const product = await findBySlug(canonicalSlug);
  if (!product) return null;
  return { product, requestedSlug, canonicalSlug, redirected: true };
}

/** Variante por lotes: conserva el orden/identidad solicitados sin N+1. */
export async function resolveProductsBySlugs<T extends { slug: string }>(
  requestedSlugs: ReadonlyArray<string>,
  findBySlugs: (slugs: ReadonlyArray<string>) => Promise<T[]>,
  findRedirects: RedirectsLookup = lookupRedirects,
): Promise<Map<string, ResolvedProductSlug<T>>> {
  const unique = [...new Set(requestedSlugs)];
  const directProducts = await findBySlugs(unique);
  const directBySlug = new Map(directProducts.map((product) => [product.slug, product]));
  const result = new Map<string, ResolvedProductSlug<T>>();

  for (const requestedSlug of unique) {
    const product = directBySlug.get(requestedSlug);
    if (product) {
      result.set(requestedSlug, {
        product,
        requestedSlug,
        canonicalSlug: requestedSlug,
        redirected: false,
      });
    }
  }

  const missing = unique.filter((slug) => !result.has(slug));
  const redirects = await findRedirects(missing);
  const targets = [...new Set([...redirects.values()])].filter((slug) => !directBySlug.has(slug));
  const targetProducts = targets.length > 0 ? await findBySlugs(targets) : [];
  const targetBySlug = new Map([
    ...directBySlug,
    ...targetProducts.map((product) => [product.slug, product] as const),
  ]);

  for (const requestedSlug of missing) {
    const canonicalSlug = redirects.get(requestedSlug);
    const product = canonicalSlug ? targetBySlug.get(canonicalSlug) : null;
    if (!canonicalSlug || !product) continue;
    result.set(requestedSlug, {
      product,
      requestedSlug,
      canonicalSlug,
      redirected: true,
    });
  }
  return result;
}
