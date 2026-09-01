import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import { crearPresupuesto, obtenerPresupuesto } from "@/lib/presupuesto-repo";
import { entradaDuplicada } from "@/lib/presupuesto-duplicar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Copia un presupuesto en uno nuevo, en borrador y con su propio número.
 *
 * Los costes de la copia salen marcados como NO verificados: ver la cabecera
 * de `presupuesto-duplicar`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    const auth = requireAdminSecret(req);
    if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const original = await obtenerPresupuesto(id);
  if (!original) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const copia = await crearPresupuesto(entradaDuplicada(original), original.createdBy);
  return NextResponse.json({ id: copia.id, numero: copia.numero }, { status: 201 });
}
