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
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

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
 * Búsqueda semántica con filtros opcionales (hybrid).
 * Devuelve top N productos ordenados por similitud cosine descendente.
 */
export async function semanticSearch(
  prismaClient: typeof import("@/lib/prisma").prisma,
  query: string,
  opts: { topK?: number; category?: string | null } = {},
): Promise<Array<{ productId: string; score: number }>> {
  const queryVec = await generateEmbedding(query);
  if (!queryVec) return [];

  // Cargar TODOS los embeddings (productos activos, no hidden).
  // Para 2.4k productos esto es ~30 MB en memoria, OK.
  const rows = await prismaClient.productEmbedding.findMany({
    where: {
      product: {
        active: true,
        NOT: { override: { hidden: true } },
        ...(opts.category ? { category: { name: { contains: opts.category, mode: "insensitive" } } } : {}),
      },
    },
    select: { productId: true, vector: true },
  });

  const scored = rows.map((r) => ({
    productId: r.productId,
    score: cosineSimilarity(queryVec, r.vector),
  }));
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
