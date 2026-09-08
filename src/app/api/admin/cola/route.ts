import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { construirColas } from "@/lib/cola-de-trabajo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cola — qué tiene pendiente quien está mirando.
 *
 * Pide sesión, no un rol concreto: cada rol tiene su cola y la de un rol
 * desconocido está vacía. Devolver 403 aquí dejaría el inicio en blanco con un
 * error, que es peor que un inicio que dice «hoy no tienes nada».
 *
 * No devuelve coste de proveedor ni margen — ver `cola-de-trabajo.ts`.
 */
export async function GET(req: Request) {
  const auth = await requireAdminSession(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const colas = await construirColas(prisma, auth.session.role);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    rol: auth.session.role,
    pendientes: colas.reduce((n, c) => n + c.total, 0),
    colas,
  });
}
