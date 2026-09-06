import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { auditarPrecios } from "@/lib/auditoria-precios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/suppliers/auditoria-precios
 *
 * La auditoría del precio público, la misma que imprime
 * `bun scripts/audit-precios-catalogo.ts`, servida al panel.
 *
 * Existe porque el script pedía una `DATABASE_URL` de producción y una
 * terminal, y por eso llevaba días sin correrse. Aquí es abrir una página.
 *
 * SOLO ADMIN, y no por costumbre: la respuesta lleva COSTES NETOS de
 * proveedor. Eso no sale de casa.
 *
 * Solo lee. Ni una escritura.
 */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const auditoria = await auditarPrecios(prisma, { ejemplos: 12 });
    return NextResponse.json({ ok: true, auditoria });
  } catch (e) {
    // El detalle va al log del servidor, no al navegador: los errores de
    // Prisma citan nombres de tabla y de columna.
    console.error("[auditoria-precios] falló la auditoría:", e);
    return NextResponse.json(
      { error: "No se ha podido completar la auditoría. Mira el log del servidor." },
      { status: 500 },
    );
  }
}
