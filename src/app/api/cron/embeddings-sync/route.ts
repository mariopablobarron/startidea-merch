import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { generateEmbedding, embeddingTextForProduct } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small";

/**
 * Genera embeddings para productos sin uno asociado. Lote de 50 por
 * llamada con throttle suave para no saturar OpenRouter.
 *
 * Llamar diariamente (idempotente). Tras unos días, todo el catálogo
 * tendrá embeddings y solo procesará productos nuevos del sync.
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const batch = Math.min(100, parseInt(url.searchParams.get("batch") || "50", 10) || 50);

  // Productos activos sin embedding
  const candidates = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT p.id FROM "Product" p
    LEFT JOIN "ProductEmbedding" e ON e."productId" = p.id
    WHERE p.active = true AND e.id IS NULL
    LIMIT ${batch}
  `;

  let processed = 0;
  let failed = 0;

  for (const { id } of candidates) {
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        brand: true,
        shortDescription: true,
        enhancedShortDescription: true,
        longDescription: true,
        material: true,
        category: { select: { name: true } },
      },
    });
    if (!product) continue;

    const text = embeddingTextForProduct(product);
    const vector = await generateEmbedding(text);
    if (!vector) {
      failed++;
      continue;
    }

    await prisma.productEmbedding.upsert({
      where: { productId: product.id },
      create: { productId: product.id, vector, model: EMBEDDING_MODEL },
      update: { vector, model: EMBEDDING_MODEL },
    });
    processed++;
    await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({ ok: true, processed, failed, batchSize: batch, candidates: candidates.length });
}

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [total, withEmbed] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.productEmbedding.count(),
  ]);

  return NextResponse.json({
    ok: true,
    total,
    withEmbed,
    pending: total - withEmbed,
    coveragePercent: total > 0 ? Math.round((withEmbed / total) * 100) : 0,
  });
}
