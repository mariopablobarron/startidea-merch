import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { runMidoceanSync } from "@/lib/suppliers/midocean-sync";
import { deactivateUnpricedProducts } from "@/lib/suppliers/sweep";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Sync MidOcean — dispara en background y responde inmediatamente.
 *
 * Traefik (Coolify) corta conexiones HTTP a 60s. El sync completo tarda
 * 80–120s, así que devolvemos 202 + dispatch en background. El estado
 * queda en `SupplierSync` y se consulta con GET.
 *
 *   POST /api/cron/midocean-sync   X-Cron-Secret  → dispara
 *   GET  /api/cron/midocean-sync   X-Cron-Secret  → consulta estado
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Detectar concurrencia: si hay un sync iniciado en últimos 10 min sin finalizar
  const last = await prisma.supplierSync.findUnique({ where: { supplier: "midocean" } });
  const inProgress =
    last &&
    !last.finishedAt &&
    Date.now() - last.startedAt.getTime() < 10 * 60 * 1000;
  if (inProgress) {
    return NextResponse.json(
      { ok: false, status: "in_progress", startedAt: last.startedAt },
      { status: 409 },
    );
  }

  // Fire-and-forget. El handler retorna inmediatamente.
  // Captura errores para log; no propagamos para no afectar el ciclo de Node.
  // Tras el sync, sweep: oculta productos sin precio (descatalogados por supplier).
  // El upsert los reactiva automáticamente cuando el supplier vuelva a enviar precio.
  void (async () => {
    await runMidoceanSync();
    await deactivateUnpricedProducts("midocean");
  })().catch((e) => {
    console.error("[midocean-sync] async failure", e);
  });

  return NextResponse.json(
    { ok: true, status: "queued", message: "Sync iniciado en background. Consulta GET para el estado." },
    { status: 202 },
  );
}

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const last = await prisma.supplierSync.findUnique({ where: { supplier: "midocean" } });
  const stats = await prisma.product.aggregate({
    where: { supplier: "midocean" },
    _count: { _all: true },
  });
  return NextResponse.json({
    ok: true,
    lastSync: last,
    productsInDb: stats._count._all,
  });
}
