import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { ensureMediaAsset } from "@/lib/proxy-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill MediaAsset para todas las imágenes ya en BD:
 * - Product.primaryImageUrl
 * - ProductVariant.imageUrl
 * - MarkingPosition.imageUrl
 * - ProductOverride.extraImages[]
 *
 * Solo CEO. Idempotente.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const start = Date.now();
  const counts = { productPrimary: 0, variant: 0, position: 0, override: 0 };

  // Productos
  const products = await prisma.product.findMany({
    where: { primaryImageUrl: { not: null } },
    select: { primaryImageUrl: true },
  });
  for (const p of products) {
    if (Date.now() - start > 270_000) break;
    if (await ensureMediaAsset(p.primaryImageUrl, "product-primary")) counts.productPrimary++;
  }

  // Variantes
  const variants = await prisma.productVariant.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  for (const v of variants) {
    if (Date.now() - start > 270_000) break;
    if (await ensureMediaAsset(v.imageUrl, "product-variant")) counts.variant++;
  }

  // Posiciones marcaje
  const positions = await prisma.markingPosition.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  for (const pos of positions) {
    if (Date.now() - start > 270_000) break;
    if (await ensureMediaAsset(pos.imageUrl, "marking-position")) counts.position++;
  }

  // Override extraImages
  const overrides = await prisma.productOverride.findMany({
    where: { extraImages: { isEmpty: false } },
    select: { extraImages: true },
  });
  for (const o of overrides) {
    for (const url of o.extraImages) {
      if (Date.now() - start > 270_000) break;
      if (await ensureMediaAsset(url, "override-extra")) counts.override++;
    }
  }

  const total = await prisma.mediaAsset.count();
  return NextResponse.json({
    ok: true,
    elapsed: `${Math.floor((Date.now() - start) / 1000)}s`,
    processed: counts,
    totalAssets: total,
  });
}
