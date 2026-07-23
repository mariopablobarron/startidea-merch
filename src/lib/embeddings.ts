/**
 * Embeddings para búsqueda semántica de productos.
 *
 * Prioridad: OpenAI directo (heredado de hub-app). Fallback OpenRouter.
 * Vector de 1536 dims (text-embedding-3-small), guardado en
 * ProductEmbedding.vector como Float[] de Postgres.
 *
 * Búsqueda: cosine similarity en JS sobre los ~2400 productos. Para este
 * volumen, ~50ms en server, sin necesidad de pgvector. Si crece a >50K,
 * migrar a pgvector con HNSW.
 */

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text || text.length < 3) return null;
  const truncated = text.slice(0, 8000);

  // 1) Preferido: OpenAI directo (más fiable, menor latencia, sin margen)
  if (OPENAI_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL.replace(/^openai\//, ""),
          input: truncated,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
        if (json.data?.[0]?.embedding) return json.data[0].embedding;
      }
    } catch {
      /* fallthrough a OpenRouter */
    }
  }

  // 2) Fallback: OpenRouter (proxy a OpenAI, requiere créditos)
  if (OPENROUTER_KEY) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": SITE_URL,
          "X-Title": "TodoMerchandising · semantic search",
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL.startsWith("openai/") ? EMBEDDING_MODEL : `openai/${EMBEDDING_MODEL}`,
          input: truncated,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
        return json.data?.[0]?.embedding || null;
      }
    } catch {
      /* return null */
    }
  }

  return null;
}

/**
 * Caché en memoria de la matriz de embeddings (productos activos, no hidden).
 *
 * Por qué: traer ~9.4k vectores de 1536 floats desde Postgres son >100 MB
 * de transferencia+parseo POR BÚSQUEDA — segundos de latencia que el cliente
 * sufría hablando con David. Cacheado como Float32Array plana (~58 MB una
 * vez, normas precalculadas), la búsqueda queda en ~50 ms + el embedding de
 * la query. TTL 15 min: los embeddings los renueva el cron diario, y un
 * producto nuevo tarda como mucho 15 min en entrar a la búsqueda semántica.
 */
type EmbeddingCache = {
  at: number;
  ids: string[];
  vectors: Float32Array; // filas concatenadas (ids.length × dims)
  norms: Float32Array;
  dims: number;
};
let embCache: EmbeddingCache | null = null;
let embCacheLoading: Promise<EmbeddingCache> | null = null;
const EMB_CACHE_TTL_MS = 15 * 60_000;

async function fetchEmbeddingMatrix(
  prismaClient: typeof import("@/lib/prisma").prisma,
): Promise<EmbeddingCache> {
  const rows = await prismaClient.productEmbedding.findMany({
    where: { product: { active: true, NOT: { override: { hidden: true } } } },
    select: { productId: true, vector: true },
  });
  const dims = rows[0]?.vector.length ?? 0;
  const vectors = new Float32Array(rows.length * dims);
  const norms = new Float32Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i].vector;
    let n = 0;
    for (let j = 0; j < dims; j++) {
      const x = v[j] ?? 0;
      vectors[i * dims + j] = x;
      n += x * x;
    }
    norms[i] = Math.sqrt(n);
  }
  embCache = { at: Date.now(), ids: rows.map((r) => r.productId), vectors, norms, dims };
  return embCache;
}

async function loadEmbeddingMatrix(
  prismaClient: typeof import("@/lib/prisma").prisma,
): Promise<EmbeddingCache> {
  const fresh = embCache && Date.now() - embCache.at < EMB_CACHE_TTL_MS;
  // Stale-while-revalidate: si hay caché (aunque caduque), se sirve al
  // instante y el refresco corre en segundo plano — la carga (~15s con 9.4k
  // productos) solo la sufre la PRIMERA búsqueda tras arrancar el contenedor,
  // y ni esa si /api/health (ping horario) ya calentó la caché.
  if (embCache && !fresh && !embCacheLoading) {
    embCacheLoading = fetchEmbeddingMatrix(prismaClient)
      .catch(() => embCache as EmbeddingCache)
      .finally(() => {
        embCacheLoading = null;
      });
  }
  if (embCache) return embCache;
  if (embCacheLoading) return embCacheLoading;
  embCacheLoading = fetchEmbeddingMatrix(prismaClient).finally(() => {
    embCacheLoading = null;
  });
  return embCacheLoading;
}

/** Calienta la caché sin bloquear (para /api/health y tras el deploy). */
export function warmEmbeddingCache(
  prismaClient: typeof import("@/lib/prisma").prisma,
): void {
  void loadEmbeddingMatrix(prismaClient).catch(() => {});
}

/**
 * Búsqueda semántica con filtros opcionales (hybrid).
 * Devuelve top N productos ordenados por similitud cosine descendente.
 */
export async function semanticSearch(
  prismaClient: typeof import("@/lib/prisma").prisma,
  query: string,
  opts: { topK?: number; category?: string | null } = {},
): Promise<Array<{ productId: string; score: number }>> {
  // El embedding de la query (API externa) y la matriz (BD/caché) en paralelo.
  const [queryVec, cache] = await Promise.all([
    generateEmbedding(query),
    loadEmbeddingMatrix(prismaClient),
  ]);
  if (!queryVec || cache.ids.length === 0 || cache.dims !== queryVec.length) return [];

  // Con filtro de categoría: resolver qué ids pertenecen (consulta ligera).
  let allowed: Set<string> | null = null;
  if (opts.category) {
    const inCat = await prismaClient.product.findMany({
      where: {
        active: true,
        category: { name: { contains: opts.category, mode: "insensitive" } },
      },
      select: { id: true },
    });
    allowed = new Set(inCat.map((p) => p.id));
  }

  let qn = 0;
  for (let j = 0; j < queryVec.length; j++) qn += queryVec[j] * queryVec[j];
  qn = Math.sqrt(qn);
  if (qn === 0) return [];

  const { ids, vectors, norms, dims } = cache;
  const scored: Array<{ productId: string; score: number }> = [];
  for (let i = 0; i < ids.length; i++) {
    if (allowed && !allowed.has(ids[i])) continue;
    if (norms[i] === 0) continue;
    let dot = 0;
    const base = i * dims;
    for (let j = 0; j < dims; j++) dot += vectors[base + j] * queryVec[j];
    scored.push({ productId: ids[i], score: dot / (norms[i] * qn) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.topK ?? 5);
}

/** Cosine similarity entre dos vectores. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function embeddingTextForProduct(p: {
  name: string;
  brand: string | null;
  shortDescription: string | null;
  enhancedShortDescription: string | null;
  longDescription: string | null;
  material: string | null;
  category?: { name: string } | null;
}): string {
  return [
    p.name,
    p.brand,
    p.category?.name,
    p.material,
    p.enhancedShortDescription || p.shortDescription,
    p.longDescription?.slice(0, 600),
  ]
    .filter(Boolean)
    .join(" · ");
}
