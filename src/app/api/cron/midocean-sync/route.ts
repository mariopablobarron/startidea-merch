import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { runMidoceanSync } from "@/lib/suppliers/midocean-sync";
import { deactivateUnpricedProducts } from "@/lib/suppliers/sweep";
import { prisma } from "@/lib/prisma";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";

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
export const POST = wrapCronHandler("midocean-sync", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Lock ATÓMICO (clave compartida con el "Sync ahora" del admin): el
  // check-then-act anterior sobre SupplierSync tenía carrera — cron nocturno
  // y botón admin solapados arrancaban dos syncs contra la misma BD.
  // TTL 45 min: si el contenedor muere a mitad, el lock caduca solo.
  if (!(await acquireCronLock("supplier-sync:midocean", 45 * 60 * 1000))) {
    return NextResponse.json({ ok: false, status: "in_progress" }, { status: 409 });
  }

  // Fire-and-forget. El handler retorna inmediatamente; el lock se libera al
  // TERMINAR el trabajo de fondo (no al responder).
  void (async () => {
    try {
      await runMidoceanSync();
      await deactivateUnpricedProducts("midocean");
    } finally {
      await releaseCronLock("supplier-sync:midocean");
    }
  })().catch((e) => {
    console.error("[midocean-sync] async failure", e);
  });

  return NextResponse.json(
    { ok: true, status: "queued", message: "Sync iniciado en background. Consulta GET para el estado." },
    { status: 202 },
  );
});

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
