/**
 * POST /api/admin/portfolio/seed-30
 *
 * Inserta los 30 ejemplos históricos extraídos del Gmail de Mario en la
 * tabla PortfolioItem. Idempotente: comprueba por `title` exact match y
 * solo inserta los que aún no existan.
 *
 * No borra nada. Si ya hay items existentes los respeta.
 *
 * Auth: cookie merch_admin con rol CEO o COMERCIAL.
 *
 * Devuelve:
 *   {
 *     ok: true,
 *     inserted: N,
 *     skipped: M,
 *     totalSeedItems: 30,
 *     totalInDb: K
 *   }
 */
import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { PORTFOLIO_SEED, PORTFOLIO_SEED_COUNT } from "@/data/portfolio-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // 1) Cargar títulos existentes para idempotencia
  const existing = await prisma.portfolioItem.findMany({ select: { title: true } });
  const existingTitles = new Set(existing.map((e) => e.title));

  // 2) Filtrar los que faltan
  const toCreate = PORTFOLIO_SEED.filter((s) => !existingTitles.has(s.title));

  if (toCreate.length === 0) {
    const totalInDb = await prisma.portfolioItem.count();
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skipped: PORTFOLIO_SEED_COUNT,
      totalSeedItems: PORTFOLIO_SEED_COUNT,
      totalInDb,
      message: "Todos los items ya estaban presentes (idempotente).",
    });
  }

  // 3) Insertar en bloque
  const result = await prisma.portfolioItem.createMany({
    data: toCreate.map((s) => ({
      title: s.title,
      description: s.description,
      clientName: s.clientName,
      sector: s.sector,
      featured: s.featured,
      active: s.active,
      order: s.order,
      imageUrl: s.imageUrl,
      updatedBy: session.email,
    })),
  });

  const totalInDb = await prisma.portfolioItem.count();

  return NextResponse.json({
    ok: true,
    inserted: result.count,
    skipped: PORTFOLIO_SEED_COUNT - result.count,
    totalSeedItems: PORTFOLIO_SEED_COUNT,
    totalInDb,
    message: `Insertados ${result.count} ejemplos. Revisa /admin/marketing/portfolio para reemplazar las imágenes placeholder con fotos reales y pedir permiso a los anonimizados antes de activarlos.`,
  });
}

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const existing = await prisma.portfolioItem.findMany({ select: { title: true } });
  const existingTitles = new Set(existing.map((e) => e.title));
  const pending = PORTFOLIO_SEED.filter((s) => !existingTitles.has(s.title));

  return NextResponse.json({
    ok: true,
    totalSeedItems: PORTFOLIO_SEED_COUNT,
    alreadyPresent: PORTFOLIO_SEED_COUNT - pending.length,
    pendingToInsert: pending.length,
    pendingTitles: pending.map((p) => p.title),
  });
}
