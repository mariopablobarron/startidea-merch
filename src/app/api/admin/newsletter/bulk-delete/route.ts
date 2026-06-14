import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/newsletter/bulk-delete  { status?, tag?, q?, confirm: true }
 *
 * Borra TODOS los NewsletterSubscriber que coinciden con el filtro (mismo que
 * el GET). SEGURIDAD: exige al menos un filtro real (tag o q). Devuelve el
 * nº borrado.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    tag?: string;
    q?: string;
    confirm?: boolean;
  };
  const status = (body.status || "").trim();
  const tag = (body.tag || "").trim();
  const q = (body.q || "").trim();

  if (!tag && !q) {
    return NextResponse.json(
      { error: "Aplica un filtro (tag o búsqueda) antes de borrar en masa." },
      { status: 400 },
    );
  }

  const where: Prisma.NewsletterSubscriberWhereInput = {
    ...(status === "subscribed"
      ? { unsubscribedAt: null }
      : status === "unsubscribed"
        ? { unsubscribedAt: { not: null } }
        : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const count = await prisma.newsletterSubscriber.count({ where });
  if (!body.confirm) {
    return NextResponse.json({ ok: true, count, deleted: false });
  }

  const res = await prisma.newsletterSubscriber.deleteMany({ where });
  return NextResponse.json({ ok: true, count: res.count, deleted: true });
}
