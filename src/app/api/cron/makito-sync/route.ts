import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { runMakitoSync } from "@/lib/suppliers/makito-sync";
import { deactivateUnpricedProducts } from "@/lib/suppliers/sweep";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // 13 min — XML 17MB + parse + upsert 4482 prods

/**
 * Sync Makito (makito.es / data.makito.es) — dispara en background y responde
 * inmediatamente. Mismo patrón que midocean-sync y cifra-sync.
 *
 *   POST /api/cron/makito-sync   X-Cron-Secret  → dispara
 *   GET  /api/cron/makito-sync   X-Cron-Secret  → consulta estado
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Concurrencia: skip si hay sync iniciado en últimos 15 min sin finalizar
  const last = await prisma.supplierSync.findUnique({ where: { supplier: "makito" } });
  const inProgress =
    last && !last.finishedAt && Date.now() - last.startedAt.getTime() < 15 * 60 * 1000;
  if (inProgress) {
    return NextResponse.json(
      { ok: false, status: "in_progress", startedAt: last.startedAt },
      { status: 409 },
    );
  }

  // Tras el sync, sweep: oculta productos cuyo feed Makito envía con
  // <variants> vacío (textiles en transición). El upsert los reactiva
  // automáticamente cuando Makito vuelva a enviar variants completas.
  void (async () => {
    await runMakitoSync();
    await deactivateUnpricedProducts("makito");
  })().catch((e) => {
    console.error("[makito-sync] async failure", e);
  });

  return NextResponse.json(
    {
      ok: true,
      status: "queued",
      message: "Sync iniciado en background. Consulta GET para el estado.",
    },
    { status: 202 },
  );
}

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const last = await prisma.supplierSync.findUnique({ where: { supplier: "makito" } });
  const stats = await prisma.product.aggregate({
    where: { supplier: "makito" },
    _count: { _all: true },
  });
  const variants = await prisma.productVariant.count({
    where: { product: { supplier: "makito" } },
  });
  const tiers = await prisma.priceTier.count({
    where: { variant: { product: { supplier: "makito" } } },
  });
  return NextResponse.json({
    ok: true,
    lastSync: last,
    products: stats._count._all,
    variants,
    tiers,
  });
}
