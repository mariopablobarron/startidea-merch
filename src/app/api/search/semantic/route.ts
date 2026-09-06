import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { generateEmbedding, cosineSimilarity } from "@/lib/embeddings";
import { publicRef } from "@/lib/internal-ref";
import { rateLimit } from "@/lib/rate-limit";
import { acquireInFlight } from "@/lib/in-flight-limit";
import { legacyHtmlToText, publicProductName } from "@/lib/product-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Búsqueda semántica.
 * GET /api/search/semantic?q=cómo regalar drinkware sostenible para campaña Q4
 *
 * Estrategia: genera embedding del query, hace cosine similarity contra todos
 * los embeddings cacheados en BD. Devuelve top 12.
 *
 * ⚠️ COSTE REAL, MEDIDO EN PRODUCCIÓN (2026-09-04), no el que decía este
 * comentario: son **6.300+ vectores**, no 2.400, y una petición tarda
 * **~153 s**, no ~50 ms. La similitud en sí son 29 ms; el tiempo se va en
 * traer los vectores y deserializar ~9,6 M de doubles en el proceso. Una sola
 * petición deja `merch-app` a ~100 % de CPU y ~7 GB de RAM, y el coste crece
 * con el catálogo. Por eso esta ruta lleva DOS topes y no uno:
 *
 *   1. `rateLimit` — por IP, contra el abuso de un cliente concreto.
 *   2. `acquireInFlight` — GLOBAL, contra el OOM: sin él, N IPs distintas
 *      pidiendo una vez cada una tumban el contenedor igual, que es el modo
 *      de fallo que ya ha tirado este VPS dos veces.
 *
 * Los dos son CONTENCIÓN, no producto: no cambian lo que devuelve la ruta.
 * Qué hacer con ella de fondo (mover el cálculo a SQL — el mismo producto
 * escalar tarda 3,8 s —, apagarla, o dejarla) está pendiente de decisión.
 */
export async function GET(req: Request) {
  // Cada hit llama a una API de embeddings de pago + carga todos los vectores.
  // 20/min se escribió cuando se creía que la petición costaba ~50 ms; con los
  // ~153 s medidos, esa cifra es permiso para tumbar el proceso desde una sola
  // IP. Calibrado al coste real: por encima de esto ya no es uso, es abuso.
  const rl = rateLimit(req, { key: "search-semantic", max: 3, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(20, parseInt(url.searchParams.get("limit") || "12", 10) || 12);

  if (q.length < 3) {
    return NextResponse.json({ ok: false, reason: "Query muy corto" }, { status: 400 });
  }

  // Slot GLOBAL: a partir de aquí empieza el trabajo caro (API de embeddings
  // de pago + 6.300 vectores en memoria). Se pide DESPUÉS de validar el
  // query para que una petición basura no ocupe el cerrojo, y se libera en
  // `finally` para que una excepción no lo deje cerrado para siempre.
  const slot = acquireInFlight({
    key: "search-semantic",
    max: 1,
    retryAfterSeconds: 60,
    message: "La búsqueda semántica está ocupada. Inténtalo en un minuto.",
  });
  if (!slot.ok) return slot.response;

  try {
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
            id: true,
            name: true,
            internalRef: true,
            primaryImageUrl: true,
            category: { select: { name: true } },
            enhancedShortDescription: true,
            shortDescription: true,
            override: { select: { customName: true } },
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
        ref: publicRef(r.product!),
        name: publicProductName(r.product!.name, r.product!.override?.customName),
        category: r.product!.category?.name,
        image: proxyImageUrl(r.product!.primaryImageUrl), // nunca URL cruda de proveedor
        description:
          legacyHtmlToText(
            r.product!.enhancedShortDescription || r.product!.shortDescription,
          ) || null,
        score: Math.round(r.score * 1000) / 1000,
      })),
    });
  } finally {
    slot.release();
  }
}
