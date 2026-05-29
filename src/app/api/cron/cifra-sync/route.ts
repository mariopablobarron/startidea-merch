import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { runCifraSync } from "@/lib/suppliers/cifra-sync";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Sync Cifra (cifra.es) — dispara en background y responde inmediatamente,
 * igual patrón que midocean-sync.
 *
 *   POST /api/cron/cifra-sync   X-Cron-Secret  → dispara
 *   GET  /api/cron/cifra-sync   X-Cron-Secret  → consulta estado
 *
 * Estado se guarda en `SupplierSync` (supplier=cifra).
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Concurrencia: si hay sync iniciado en últimos 10 min sin finalizar → 409
  const last = await prisma.supplierSync.findUnique({ where: { supplier: "cifra" } });
  const inProgress =
    last && !last.finishedAt && Date.now() - last.startedAt.getTime() < 10 * 60 * 1000;
  if (inProgress) {
    return NextResponse.json(
      { ok: false, status: "in_progress", startedAt: last.startedAt },
      { status: 409 },
    );
  }

  // Fire-and-forget — el handler retorna inmediato. El sync corre en background
  // y persiste resultado en SupplierSync.
  void runCifraSync().catch((e) => {
    console.error("[cifra-sync] async failure", e);
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

  const last = await prisma.supplierSync.findUnique({ where: { supplier: "cifra" } });
  const stats = await prisma.product.aggregate({
    where: { supplier: "cifra" },
    _count: { _all: true },
  });
  const variants = await prisma.productVariant.count({
    where: { product: { supplier: "cifra" } },
  });
  const tiers = await prisma.priceTier.count({
    where: { variant: { product: { supplier: "cifra" } } },
  });
  return NextResponse.json({
    ok: true,
    lastSync: last,
    products: stats._count._all,
    variants,
    tiers,
  });
}
