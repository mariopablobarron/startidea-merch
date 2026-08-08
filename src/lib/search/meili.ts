/**
 * Meilisearch como motor de búsqueda del catálogo (tolerante a erratas,
 * ranking por relevancia). Wrapper REST mínimo con fetch — sin dependencia.
 *
 * Diseño:
 *  - El contenedor merch-meili vive SOLO en la red interna merch_net: nunca
 *    se expone a internet; toda búsqueda pública pasa por nuestras rutas API.
 *  - Los documentos NO llevan precio (evita índices caducos cuando Mario
 *    cambia tarifas) y NUNCA llevan datos de proveedor — ver
 *    buildProductSearchDocument y su test de fuga.
 *  - Reindex = índice temporal + swap atómico (los borrados desaparecen y la
 *    búsqueda nunca ve un índice a medias).
 *  - TODO consumidor debe tratar el motor como OPCIONAL: si Meili no está
 *    configurado o no responde en MEILI_TIMEOUT_MS, se devuelve null y el
 *    llamante usa el camino Prisma de siempre (fallback, no error).
 */
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { publicRef } from "@/lib/internal-ref";
import { legacyHtmlToText, normalizeProductName } from "@/lib/product-name";

const HOST = process.env.MEILI_HOST || "http://merch-meili:7700";
const KEY = process.env.MEILI_MASTER_KEY || "";
const INDEX = "products";
const MEILI_TIMEOUT_MS = 700;

export function meiliEnabled(): boolean {
  return KEY.length > 0;
}

async function meiliFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? MEILI_TIMEOUT_MS);
  try {
    const res = await fetch(`${HOST}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      throw new Error(`Meili ${res.status} en ${path}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export type ProductSearchDocument = {
  id: string;
  slug: string;
  name: string;
  /** SIEMPRE la ref pública STM-XXX — jamás la del proveedor. */
  ref: string;
  categoryPath: string;
  tags: string[];
  shortDescription: string;
  /** Siempre vía proxy /api/m/<hash> — jamás el CDN del proveedor. */
  imageUrl: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  internalRef: string | null;
  tags: string[];
  shortDescription: string | null;
  primaryImageUrl: string | null;
  category: { name: string; parent: { name: string } | null } | null;
};

/**
 * Mapper producto→documento. Es la ÚNICA puerta por la que entran datos al
 * índice: mantenerla libre de proveedor (supplier, supplierRef, URLs CDN).
 * Guard: src/lib/search/meili.test.ts
 */
export function buildProductSearchDocument(p: ProductRow): ProductSearchDocument {
  return {
    id: p.id,
    slug: p.slug,
    name: normalizeProductName(p.name),
    ref: publicRef(p),
    categoryPath: [p.category?.parent?.name, p.category?.name].filter(Boolean).join(" › "),
    tags: p.tags ?? [],
    shortDescription: legacyHtmlToText(p.shortDescription).slice(0, 300),
    imageUrl: p.primaryImageUrl ? proxyImageUrl(p.primaryImageUrl) : null,
  };
}

async function waitForTask(taskUid: number, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const task = await meiliFetch<{ status: string; error?: { message?: string } }>(
      `/tasks/${taskUid}`,
      { timeoutMs: 5_000 },
    );
    if (task.status === "succeeded") return;
    if (task.status === "failed" || task.status === "canceled")
      throw new Error(`Tarea Meili ${taskUid} ${task.status}: ${task.error?.message ?? "?"}`);
    if (Date.now() - start > timeoutMs) throw new Error(`Tarea Meili ${taskUid} timeout`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Reindexa TODO el catálogo activo en un índice temporal y hace swap atómico.
 * ~9.5k documentos ligeros → segundos. Lanza error si Meili no responde;
 * los llamantes deciden si es fatal (endpoint admin) o solo log (post-sync).
 */
export async function reindexAllProducts(): Promise<{ indexed: number }> {
  if (!meiliEnabled()) throw new Error("MEILI_MASTER_KEY no configurada");
  const tmp = `${INDEX}_next`;

  // Índice temporal limpio (ignorar 404 si no existía)
  await meiliFetch<{ taskUid: number }>(`/indexes/${tmp}`, { method: "DELETE", timeoutMs: 5_000 })
    .then((t) => waitForTask(t.taskUid))
    .catch(() => {});
  const created = await meiliFetch<{ taskUid: number }>(`/indexes`, {
    method: "POST",
    body: JSON.stringify({ uid: tmp, primaryKey: "id" }),
    timeoutMs: 5_000,
  });
  await waitForTask(created.taskUid);
  const settings = await meiliFetch<{ taskUid: number }>(`/indexes/${tmp}/settings`, {
    method: "PATCH",
    body: JSON.stringify({
      searchableAttributes: ["name", "ref", "categoryPath", "tags", "shortDescription"],
      displayedAttributes: ["id", "slug", "name", "ref", "categoryPath", "imageUrl"],
    }),
    timeoutMs: 5_000,
  });
  await waitForTask(settings.taskUid);

  let indexed = 0;
  const BATCH = 1000;
  for (let skip = 0; ; skip += BATCH) {
    const rows: ProductRow[] = await prisma.product.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
      skip,
      take: BATCH,
      select: {
        id: true,
        slug: true,
        name: true,
        internalRef: true,
        tags: true,
        shortDescription: true,
        primaryImageUrl: true,
        category: { select: { name: true, parent: { select: { name: true } } } },
      },
    });
    if (rows.length === 0) break;
    const docs = rows.map(buildProductSearchDocument);
    const task = await meiliFetch<{ taskUid: number }>(`/indexes/${tmp}/documents`, {
      method: "PUT",
      body: JSON.stringify(docs),
      timeoutMs: 30_000,
    });
    await waitForTask(task.taskUid);
    indexed += docs.length;
    if (rows.length < BATCH) break;
  }

  // Primer arranque: swap exige que AMBOS índices existan. Crear el
  // definitivo vacío si aún no está (index_already_exists = ignorable).
  await meiliFetch<{ taskUid: number }>(`/indexes`, {
    method: "POST",
    body: JSON.stringify({ uid: INDEX, primaryKey: "id" }),
    timeoutMs: 5_000,
  })
    .then((t) => waitForTask(t.taskUid))
    .catch(() => {});

  const swap = await meiliFetch<{ taskUid: number }>(`/swap-indexes`, {
    method: "POST",
    body: JSON.stringify([{ indexes: [INDEX, tmp] }]),
    timeoutMs: 10_000,
  });
  await waitForTask(swap.taskUid);
  return { indexed };
}

type MeiliHit = Pick<ProductSearchDocument, "id" | "slug" | "name" | "ref" | "categoryPath" | "imageUrl">;

async function search(q: string, limit: number): Promise<MeiliHit[]> {
  const res = await meiliFetch<{ hits: MeiliHit[] }>(`/indexes/${INDEX}/search`, {
    method: "POST",
    body: JSON.stringify({ q, limit }),
  });
  return res.hits ?? [];
}

/**
 * Sugerencias para el dropdown del nav. null = Meili no disponible → el
 * llamante usa el fallback Prisma. [] = disponible pero sin resultados.
 */
export async function suggestProductsSafe(q: string, limit = 8): Promise<MeiliHit[] | null> {
  if (!meiliEnabled()) return null;
  try {
    return await search(q, limit);
  } catch (e) {
    console.error("[meili] suggest falló, fallback Prisma:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * IDs rankeados para /catalogo?q= — se inyectan como filtro {id:{in}} en el
 * pipeline Prisma existente (los filtros de color/talla/precio siguen igual).
 * null = no disponible → fallback al searchClause de siempre.
 */
export async function searchProductIdsSafe(q: string, limit = 600): Promise<string[] | null> {
  if (!meiliEnabled()) return null;
  try {
    const hits = await search(q, limit);
    return hits.map((h) => h.id);
  } catch (e) {
    console.error("[meili] search falló, fallback Prisma:", e instanceof Error ? e.message : e);
    return null;
  }
}
