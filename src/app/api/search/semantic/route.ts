import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateEmbedding, cosineSimilarity } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Búsqueda semántica.
 * GET /api/search/semantic?q=cómo regalar drinkware sostenible para campaña Q4
 *
 * Estrategia: genera embedding del query, hace cosine similarity contra todos
 * los embeddings cacheados en BD (~2400 productos = ~50ms). Devuelve top 12.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(20, parseInt(url.searchParams.get("limit") || "12", 10) || 12);

  if (q.length < 3) {
    return NextResponse.json({ ok: false, reason: "Query muy corto" }, { status: 400 });
  }

  const queryVector = await generateEmbedding(q);
  if (!queryVector) {
    return NextResponse.json(
      { ok: false, reason: "No se pudo generar embedding (OPENROUTER_API_KEY?)" },
      { status: 503 },
    );
  }

  // Carga todos los embeddings + datos básicos del producto
  const all = await prisma.productEmbedding.findMany({
    select: {
      vector: true,
      product: {
        select: {
          slug: true,
          name: true,
          supplierRef: true,
          primaryImageUrl: true,
          category: { select: { name: true } },
          enhancedShortDescription: true,
          shortDescription: true,
        },
      },
    },
  });

  const ranked = all
    .filter((row) => row.product)
    .map((row) => ({
      score: cosineSimilarity(queryVector, row.vector),
      product: row.product,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({
    ok: true,
    q,
    count: ranked.length,
    candidates: all.length,
    items: ranked.map((r) => ({
      slug: r.product!.slug,
      ref: r.product!.supplierRef,
      name: r.product!.name,
      category: r.product!.category?.name,
      image: r.product!.primaryImageUrl,
      description: r.product!.enhancedShortDescription || r.product!.shortDescription,
      score: Math.round(r.score * 1000) / 1000,
    })),
  });
}
