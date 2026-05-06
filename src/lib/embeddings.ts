/**
 * Embeddings para búsqueda semántica de productos.
 *
 * Usa OpenRouter (que enruta a OpenAI text-embedding-3-small por defecto).
 * Vector de 1536 dims, almacenado en ProductEmbedding.vector como Float[].
 *
 * Búsqueda: cosine similarity en JS sobre los ~2400 productos. Para este
 * volumen, ~50ms en server, sin necesidad de pgvector. Si crece a >50K,
 * migrar a pgvector con HNSW.
 */

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!OPENROUTER_KEY) return null;
  if (!text || text.length < 3) return null;

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
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
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
