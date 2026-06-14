import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_STATUSES = [
  "NEW", "INVITED", "CONNECTED", "MESSAGED", "REPLIED",
  "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "NURTURING",
] as const;

/**
 * POST /api/admin/outbound/bulk-delete  { status?, source?, q?, confirm: true }
 *
 * Borra TODOS los OutboundLead que coinciden con el filtro (mismo que el GET).
 * SEGURIDAD: exige al menos un filtro real (source o q) para no permitir
 * borrar toda la base de un clic. Devuelve el nº borrado.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    source?: string;
    q?: string;
    confirm?: boolean;
  };
  const status = (body.status || "").trim();
  const source = (body.source || "").trim();
  const q = (body.q || "").trim();

  if (!source && !q) {
    return NextResponse.json(
      { error: "Aplica un filtro (origen o búsqueda) antes de borrar en masa." },
      { status: 400 },
    );
  }

  const where: Prisma.OutboundLeadWhereInput = {
    ...(status && ALL_STATUSES.includes(status as never)
      ? { status: status as (typeof ALL_STATUSES)[number] }
      : {}),
    ...(source ? { source } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { segment: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const count = await prisma.outboundLead.count({ where });
  if (!body.confirm) {
    // Primer paso: solo devuelve cuántos se borrarían (para confirmar en UI).
    return NextResponse.json({ ok: true, count, deleted: false });
  }

  const res = await prisma.outboundLead.deleteMany({ where });
  return NextResponse.json({ ok: true, count: res.count, deleted: true });
}
