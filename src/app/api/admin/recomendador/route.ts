import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista de consultas al recomendador IA con búsqueda + filtros.
 *
 * Query params:
 *   q         búsqueda en brief
 *   filter    all | fallback | clarification (default: all)
 *   days      últimos N días (default 90)
 *   page, perPage (default 50)
 *
 * Devuelve además KPIs agregados:
 *   - total queries últimos 30 días
 *   - % fallback
 *   - % clarification
 *   - top palabras del brief (top 20)
 *   - top productos recomendados
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const filter = url.searchParams.get("filter") || "all";
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days") || "90", 10)));
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, parseInt(url.searchParams.get("perPage") || "50", 10) || 50);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const where: Prisma.RecommenderQueryWhereInput = {
    createdAt: { gte: since },
    ...(q ? { brief: { contains: q, mode: "insensitive" as const } } : {}),
    ...(filter === "fallback" ? { fallback: true } : {}),
    ...(filter === "clarification" ? { needsClarification: true } : {}),
  };

  const [items, total, kpiTotal30, kpiFallback30, kpiClarif30, topRecs] = await Promise.all([
    prisma.recommenderQuery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: perPage,
      skip: (page - 1) * perPage,
      select: {
        id: true,
        brief: true,
        budget: true,
        quantity: true,
        ecoOnly: true,
        needsClarification: true,
        fallback: true,
        recommendedSlugs: true,
        summary: true,
        modelUsed: true,
        promptTokens: true,
        completionTokens: true,
        ip: true,
        createdAt: true,
        mode: true,
        quoteItems: true,
        quoteTotalCents: true,
      },
    }),
    prisma.recommenderQuery.count({ where }),
    prisma.recommenderQuery.count({ where: { createdAt: { gte: last30 } } }),
    prisma.recommenderQuery.count({
      where: { createdAt: { gte: last30 }, fallback: true },
    }),
    prisma.recommenderQuery.count({
      where: { createdAt: { gte: last30 }, needsClarification: true },
    }),
    // Top productos recomendados (más frecuentes en el array recommendedSlugs)
    prisma.$queryRaw<Array<{ slug: string; count: bigint }>>`
      SELECT slug, COUNT(*)::BIGINT AS count
      FROM (
        SELECT UNNEST("recommendedSlugs") AS slug
        FROM "RecommenderQuery"
        WHERE "createdAt" >= ${last30}
      ) t
      GROUP BY slug
      ORDER BY count DESC
      LIMIT 15
    `,
  ]);

  return NextResponse.json({
    ok: true,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    items,
    kpis: {
      total30d: kpiTotal30,
      fallback30d: kpiFallback30,
      clarification30d: kpiClarif30,
      fallbackPct: kpiTotal30 > 0 ? Number(((kpiFallback30 / kpiTotal30) * 100).toFixed(1)) : 0,
      clarifPct: kpiTotal30 > 0 ? Number(((kpiClarif30 / kpiTotal30) * 100).toFixed(1)) : 0,
    },
    topRecommended: topRecs.map((r) => ({ slug: r.slug, count: Number(r.count) })),
  });
}
