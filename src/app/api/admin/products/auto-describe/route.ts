import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/admin-auth";
import { generateProductDescription } from "@/lib/product-description-generator";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SHORT_MIN_LEN = 20;
const LONG_MIN_LEN = 50;
const BATCH_LIMIT_MAX = 30;
const BATCH_LIMIT_DEFAULT = 10;

/**
 * GET: estadísticas — cuántos productos sin descripción decente y
 * preview de los próximos N que se generarían.
 *
 * POST: ejecuta batch. Genera descripciones IA para los próximos N
 * productos con descripción pobre. Limitado a 30 por llamada para
 * evitar timeouts y costes excesivos.
 *
 * Coste estimado por producto: ~$0.002-0.01 (Haiku 4.5).
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "COMERCIAL");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const stats = await getStats();
  const preview = await listMissing(5);

  return NextResponse.json({
    ok: true,
    stats,
    preview: preview.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category?.name ?? null,
      material: p.material,
      shortLen: (p.shortDescription || "").length,
      longLen: (p.longDescription || "").length,
    })),
  });
}

const PostSchema = z.object({
  limit: z.number().int().min(1).max(BATCH_LIMIT_MAX).optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(req, "COMERCIAL");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const limit = parsed.data.limit ?? BATCH_LIMIT_DEFAULT;
  const dryRun = parsed.data.dryRun === true;

  const products = await listMissing(limit);
  if (products.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "Sin productos pendientes" });
  }

  const results: Array<{
    slug: string;
    ok: boolean;
    error?: string;
    shortLen?: number;
    longLen?: number;
    dryRun?: boolean;
  }> = [];
  let successCount = 0;
  let failCount = 0;

  for (const product of products) {
    const result = await generateProductDescription({
      name: product.name,
      category: product.category?.name ?? null,
      material: product.material,
      shortDescriptionExisting: product.shortDescription,
      longDescriptionExisting: product.longDescription,
      tags: product.tags,
      variants: product.variants.map((v) => ({ colorName: v.colorName, size: v.size })),
      markingPositions: product.positions.map((p) => ({
        positionId: p.positionId,
        techniques: p.techniques.map((t) => t.technique.name).filter(Boolean),
      })),
    });

    if (!result.ok) {
      results.push({ slug: product.slug, ok: false, error: result.error });
      failCount++;
      continue;
    }

    if (!dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          shortDescription: result.shortDescription,
          longDescription: result.longDescription,
        },
      });
    }
    results.push({
      slug: product.slug,
      ok: true,
      shortLen: result.shortDescription.length,
      longLen: result.longDescription.length,
      dryRun,
    });
    successCount++;
  }

  void notifyTelegram(
    `🤖 <b>Auto-describe productos</b>\n${successCount} ok · ${failCount} fail${dryRun ? " · DRY-RUN" : ""}\nQuedan: ${(await getStats()).missing}`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    processed: successCount,
    failed: failCount,
    dryRun,
    results,
    remaining: (await getStats()).missing,
  });
}

async function getStats() {
  const [missingShort, missingLong, total] = await Promise.all([
    prisma.product.count({
      where: {
        active: true,
        OR: [{ shortDescription: null }, { shortDescription: { equals: "" } }],
      },
    }),
    prisma.product.count({
      where: {
        active: true,
        OR: [{ longDescription: null }, { longDescription: { equals: "" } }],
      },
    }),
    prisma.product.count({ where: { active: true } }),
  ]);
  // missing = productos con AL MENOS uno de los campos pobre
  const missing = await prisma.product.count({
    where: missingFilter(),
  });
  return { total, missingShort, missingLong, missing };
}

function missingFilter() {
  return {
    active: true,
    OR: [
      { shortDescription: null },
      { shortDescription: { equals: "" } },
      { longDescription: null },
      { longDescription: { equals: "" } },
    ],
  };
}

async function listMissing(limit: number) {
  return prisma.product.findMany({
    where: missingFilter(),
    orderBy: [{ override: { featured: "desc" } }, { syncedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      name: true,
      material: true,
      shortDescription: true,
      longDescription: true,
      tags: true,
      category: { select: { name: true } },
      variants: { take: 10, select: { colorName: true, size: true } },
      positions: {
        select: {
          positionId: true,
          techniques: { select: { technique: { select: { name: true } } } },
        },
      },
    },
  });
}
