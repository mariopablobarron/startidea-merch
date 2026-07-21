import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, requireScope } from "@/lib/api-auth";
import { publicRef } from "@/lib/internal-ref";
import { proxyImageUrl } from "@/lib/proxy-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/products?q=&page=&pageSize=
 * Catálogo paginado para clientes API. Devuelve productos activos.
 */
export async function GET(req: Request) {
  let auth = await authenticateApiKey(req);
  auth = requireScope(auth, "read:catalog");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));

  const where = {
    active: true,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: "asc" },
      select: {
        slug: true,
        id: true,
        internalRef: true,
        name: true,
        brand: true,
        shortDescription: true,
        enhancedShortDescription: true,
        material: true,
        primaryImageUrl: true,
        countryOfOrigin: true,
        weightG: true,
        lengthMm: true,
        widthMm: true,
        heightMm: true,
        category: { select: { name: true, slug: true } },
        variants: {
          select: { sku: true, colorName: true, colorGroup: true, stockQty: true, gtin: true, size: true },
        },
        positions: {
          select: {
            positionId: true,
            maxWidthMm: true,
            maxHeightMm: true,
            techniques: { select: { technique: { select: { code: true, name: true } }, maxColors: true } },
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    items: items.map((p) => ({
      ref: publicRef(p),
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      description: p.enhancedShortDescription || p.shortDescription,
      material: p.material,
      countryOfOrigin: p.countryOfOrigin,
      dimensions: { length_mm: p.lengthMm, width_mm: p.widthMm, height_mm: p.heightMm, weight_g: p.weightG },
      // Defensa en profundidad: NUNCA emitir la URL cruda del CDN (delata al
      // proveedor). Hoy la BD ya guarda el proxy, pero proxyImageUrl() es
      // idempotente y cierra el hueco si algún día entra una URL cruda —
      // mismo patrón que /api/recommend tras la fuga del 2026-07-20.
      image: proxyImageUrl(p.primaryImageUrl),
      category: p.category,
      variants: p.variants,
      marking: p.positions.map((pos) => ({
        position: pos.positionId,
        max_width_mm: pos.maxWidthMm,
        max_height_mm: pos.maxHeightMm,
        techniques: pos.techniques.map((t) => ({ code: t.technique.code, name: t.technique.name, max_colors: t.maxColors })),
      })),
    })),
  });
}
