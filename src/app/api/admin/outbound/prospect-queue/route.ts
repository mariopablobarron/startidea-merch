import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/outbound/prospect-queue?source=&size=
 *
 * Cola de prospección del día: leads B2B aún SIN contactar (status NEW, con
 * email, no emailados, no suprimidos), priorizados (más antiguos primero).
 * Devuelve el lote + progreso de hoy + pendientes + orígenes disponibles.
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const source = (url.searchParams.get("source") || "").trim();
  const size = Math.min(50, Math.max(5, parseInt(url.searchParams.get("size") || "20", 10) || 20));

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  // Emails suprimidos (no contactar) — pocos, los excluimos de la cola.
  const suppressed = (await prisma.outboundSuppression.findMany({ select: { email: true } })).map((s) => s.email);

  const baseWhere: Prisma.OutboundLeadWhereInput = {
    status: "NEW",
    email: { not: null, ...(suppressed.length ? { notIn: suppressed } : {}) },
    lastEmailedAt: null,
    ...(source ? { source } : {}),
  };

  const [leads, pending, todayCount, sourceGroups] = await Promise.all([
    prisma.outboundLead.findMany({
      where: baseWhere,
      orderBy: { createdAt: "asc" },
      take: size,
      select: { id: true, name: true, company: true, email: true, phone: true, segment: true, source: true, linkedinUrl: true },
    }),
    prisma.outboundLead.count({ where: baseWhere }),
    prisma.outboundLead.count({ where: { lastEmailedAt: { gte: startToday } } }),
    prisma.outboundLead.groupBy({
      by: ["source"],
      where: { status: "NEW", email: { not: null }, lastEmailedAt: null },
      _count: { _all: true },
    }),
  ]);

  const sources = sourceGroups
    .map((s) => ({ source: s.source, count: s._count._all }))
    .filter((s): s is { source: string; count: number } => Boolean(s.source))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ ok: true, leads, pending, todayCount, sources });
}
