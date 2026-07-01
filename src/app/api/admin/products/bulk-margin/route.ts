import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { clientFromPriceCents } from "@/lib/product-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/products/bulk-margin
 *
 * Aplica un margen % (o lo quita) a múltiples productos a la vez, vía upsert de
 * ProductOverride.marginPct. Útil para subir/bajar precios por categoría
 * (ej. "marcar +35% todo el textil") sin entrar producto a producto.
 *
 * Body:
 *   {
 *     productIds: string[],      // hasta 200
 *     marginPct: number | null,  // null = quitar override (vuelve a margen global)
 *     preview?: boolean          // true = NO escribe; devuelve antes→después
 *   }
 *
 * Permisos: CEO o COMERCIAL.
 *
 * Con `preview:true` la operación es de solo lectura: calcula el precio "desde"
 * cliente actual y el que quedaría con el nuevo margen, para que el admin
 * confirme el impacto ANTES de aplicar (la aplicación es destructiva sobre 200
 * productos). Aplicar margen % descarta el precio absoluto (customFromPriceCents).
 */

const Schema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200),
  marginPct: z.number().int().min(-90).max(500).nullable(),
  preview: z.boolean().optional(),
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
  const { productIds, marginPct, preview } = parsed.data;

  // ─── Modo PREVIEW: solo lectura, antes→después ──────────────────────────
  if (preview) {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        internalRef: true,
        supplierRef: true,
        fromPriceCents: true,
        override: {
          select: { customFromPriceCents: true, marginPct: true, marketingTags: true },
        },
      },
    });
    const foundIds = new Set(products.map((p) => p.id));
    const items = products.map((p) => {
      const current = clientFromPriceCents(p.fromPriceCents, p.override ?? null);
      const next = clientFromPriceCents(p.fromPriceCents, {
        customFromPriceCents: null,
        marginPct,
        marketingTags: [],
      });
      return {
        id: p.id,
        name: p.name,
        ref: p.internalRef || p.supplierRef || null,
        currentFromPriceCents: current,
        newFromPriceCents: next,
        changed: current !== next,
      };
    });
    return NextResponse.json({
      ok: true,
      preview: true,
      marginPct,
      count: items.length,
      changedCount: items.filter((i) => i.changed).length,
      items,
      missing: productIds.filter((id) => !foundIds.has(id)),
    });
  }

  // ─── Modo APLICAR ────────────────────────────────────────────────────────
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
