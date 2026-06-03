/**
 * POST /api/cron/product-view-rollup
 *
 * Mantenimiento diario de ProductView. Tareas:
 *
 * 1. Resetea contadores 30d (view30d, cartAdd30d) para productos sin
 *    actividad reciente (lastViewedAt > 30 días). Sin esto el contador
 *    "30d" deriva con el tiempo y deja de reflejar la ventana real.
 *
 * 2. Limpia ProductView de productos desactivados (active=false) o
 *    eliminados. Mantiene la tabla pequeña y los rankings limpios.
 *
 * Programado: diario 03:30 UTC (después de los syncs de proveedores).
 */
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;

export const POST = wrapCronHandler("product-view-rollup", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const since30d = new Date(Date.now() - 30 * DAY_MS);
  const startedAt = Date.now();

  // 1. Reset contadores 30d para productos cuya última view fue >30d.
  const stale = await prisma.productView.updateMany({
    where: { lastViewedAt: { lt: since30d } },
    data: { view30d: 0, cartAdd30d: 0 },
  });

  // 2. Limpiar ProductView huérfanos: productos desactivados o sin entry.
  // (FK ON DELETE CASCADE limpia los eliminados; aquí limpiamos los
  // active=false que ya no queremos en rankings.)
  const inactiveProductIds = await prisma.product.findMany({
    where: { active: false },
    select: { id: true },
    take: 5000,
  });
  const cleaned = inactiveProductIds.length
    ? await prisma.productView.deleteMany({
        where: { productId: { in: inactiveProductIds.map((p) => p.id) } },
      })
    : { count: 0 };

  const durationMs = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    resetStale: stale.count,
    cleanedInactive: cleaned.count,
    durationMs,
  });
});
