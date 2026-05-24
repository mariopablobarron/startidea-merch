import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/products/bulk-margin
 *
 * Aplica un margen % o un descuento % a múltiples productos a la vez,
 * vía upsert de ProductOverride.marginPct. Útil para subir/bajar precios
 * por categoría (ej. "marcar +35% todo el textil") sin entrar producto
 * a producto.
 *
 * Body:
 *   {
 *     productIds: string[],     // hasta 200
 *     marginPct: number | null  // null = quitar override (vuelve a precio base)
 *   }
 *
 * Permisos: CEO o COMERCIAL.
 *
 * Importante: aplica también customFromPriceCents=null para que el margen
 * % gane (si había precio absoluto, lo descarta).
 */

const Schema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200),
  marginPct: z.number().int().min(-90).max(500).nullable(),
});

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { productIds, marginPct } = parsed.data;

  // Verificar que existen (no fallar a media operación)
  const found = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });
  const foundSet = new Set(found.map((p) => p.id));
  const missing = productIds.filter((id) => !foundSet.has(id));

  // Upsert en bloque dentro de una transacción para coherencia
  const ops = [...foundSet].map((id) =>
    prisma.productOverride.upsert({
      where: { productId: id },
      update: {
        marginPct,
        // Si se aplica margen %, quitamos el precio absoluto (no puede haber 2 fuentes)
        ...(marginPct != null ? { customFromPriceCents: null } : {}),
        updatedBy: session.email,
      },
      create: {
        productId: id,
        marginPct,
        updatedBy: session.email,
      },
    }),
  );

  await prisma.$transaction(ops);

  return NextResponse.json({
    ok: true,
    updated: foundSet.size,
    missing,
    marginPct,
  });
}
