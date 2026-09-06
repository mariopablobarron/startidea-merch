import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { getAdminSession } from "@/lib/admin-auth";
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

  // La copia la firma quien la hace, no quien escribió el original: si no, el
  // rastro de quién montó cada presupuesto deja de servir para nada.
  const sesion = await getAdminSession().catch(() => null);
  const copia = await crearPresupuesto(entradaDuplicada(original), sesion?.email ?? null);
  return NextResponse.json({ id: copia.id, numero: copia.numero }, { status: 201 });
}
