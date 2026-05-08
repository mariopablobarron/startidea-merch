import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { generateInternalRef } from "@/lib/internal-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Backfill de referencias propias Startidea para todos los productos
 * que aún no tienen internalRef. Solo CEO. Idempotente.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let processed = 0;
  let collisions = 0;
  const start = Date.now();

  while (Date.now() - start < 240_000) {
    const batch = await prisma.product.findMany({
      where: { internalRef: null },
      select: { id: true },
      take: 200,
    });
    if (batch.length === 0) break;
    for (const p of batch) {
      const ref = generateInternalRef(p.id);
      try {
        await prisma.product.update({ where: { id: p.id }, data: { internalRef: ref } });
        processed++;
      } catch {
        // Colisión rarísima (32^6 ≈ 1B combos para 2.4k productos). Suffix con 2 chars del id.
        try {
          await prisma.product.update({
            where: { id: p.id },
            data: { internalRef: `${ref}-${p.id.slice(0, 2).toUpperCase()}` },
          });
          processed++;
          collisions++;
        } catch {
          // Skip — probablemente ya tiene ref
        }
      }
    }
  }

  const remaining = await prisma.product.count({ where: { internalRef: null } });
  return NextResponse.json({ ok: true, processed, collisions, remaining });
}
