import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/content/[id]/approve
 * Marca la pieza como APPROVED (lista para programar / publicar).
 * Solo CEO puede aprobar. COMERCIAL puede pasar a REVIEW.
 *
 * Body opcional: { schedule: ISO datetime } → además marca como SCHEDULED.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede aprobar" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const schedule = typeof body.schedule === "string" ? body.schedule : null;

  const existing = await prisma.contentPiece.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (existing.status === "PUBLISHED" || existing.status === "ARCHIVED") {
    return NextResponse.json(
      { error: `No se puede aprobar pieza en estado ${existing.status}` },
      { status: 409 },
    );
  }

  const updated = await prisma.contentPiece.update({
    where: { id },
    data: {
      status: schedule ? "SCHEDULED" : "APPROVED",
      approvedBy: session.email,
      approvedAt: new Date(),
      ...(schedule ? { scheduledAt: new Date(schedule) } : {}),
    },
  });

  return NextResponse.json({ ok: true, piece: updated });
}
