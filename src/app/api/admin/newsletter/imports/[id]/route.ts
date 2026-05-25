import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/admin/newsletter/imports/[id]   detalle batch + cuántos subscribers viven todavía
 * DELETE /api/admin/newsletter/imports/[id]   borra el batch + subscribers de él (deshacer importación)
 *
 * El delete sigue una regla conservadora:
 *  - Solo borra subscribers cuyo `importBatchId = id` Y que tienen una sola
 *    fuente (tags == [tagDelBatch] o tags vacíos). Si el subscriber ya
 *    estaba en otra lista (multiples tags), NO se borra — se le quita SOLO
 *    el tag del batch.
 *  - Esto evita borrar gente que estaba antes en otras listas pero a quien
 *    el batch solo "añadió" un tag.
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const batch = await prisma.newsletterImport.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const stillAlive = await prisma.newsletterSubscriber.count({
    where: { importBatchId: id },
  });

  return NextResponse.json({ ok: true, batch, stillAlive });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const batch = await prisma.newsletterImport.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Subscribers de este batch — separar los "exclusivos" (solo tienen este tag o ninguno)
  // de los "compartidos" (también están en otras listas)
  const subs = await prisma.newsletterSubscriber.findMany({
    where: { importBatchId: id },
    select: { id: true, email: true, tags: true },
  });

  let deleted = 0;
  let untagged = 0;

  for (const s of subs) {
    const otherTags = s.tags.filter((t) => t !== batch.tag);
    if (otherTags.length === 0) {
      // Solo tenía el tag del batch (o ningún tag) → borrar
      await prisma.newsletterSubscriber.delete({ where: { id: s.id } }).catch(() => {});
      deleted++;
    } else {
      // Tiene más listas → quitar solo el tag del batch + romper FK al batch
      await prisma.newsletterSubscriber
        .update({
          where: { id: s.id },
          data: { tags: otherTags, importBatchId: null },
        })
        .catch(() => {});
      untagged++;
    }
  }

  // Finalmente borrar el batch (los FK ya están limpios o en SET NULL)
  await prisma.newsletterImport.delete({ where: { id } }).catch(() => {});

  return NextResponse.json({ ok: true, deleted, untagged });
}
