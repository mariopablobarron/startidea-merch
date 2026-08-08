/**
 * POST /api/admin/suppliers/cifra/sync-now
 *
 * Versión admin del cron-sync de Cifra. Usa cookie merch_admin (no
 * requiere CRON_SECRET) para que el CEO pueda dispararlo desde el
 * botón "🔄 Sync ahora" en /admin/suppliers/cifra.
 *
 * Mismo guard de concurrencia + fire-and-forget que el cron público.
 *
 * GET devuelve estado y conteos actuales.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { runCifraSync } from "@/lib/suppliers/cifra-sync";
import { acquireCronLockLease, releaseCronLockLease } from "@/lib/cron-lock";
import { deactivateUnpricedProducts } from "@/lib/suppliers/sweep";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  // Lock ATÓMICO con la MISMA clave que el cron nocturno: botón admin y cron
  // solapados ya no pueden arrancar dos syncs a la vez (doble carga en la VPS).
  const lockToken = await acquireCronLockLease("supplier-sync:cifra", 45 * 60 * 1000);
  if (!lockToken) {
    return NextResponse.json(
      { ok: false, status: "in_progress", message: "Ya hay un sync en curso. Espera unos minutos." },
      { status: 409 },
    );
  }

  void (async () => {
    try {
      await runCifraSync();
      await deactivateUnpricedProducts("cifra");
    } finally {
      await releaseCronLockLease("supplier-sync:cifra", lockToken);
    }
  })().catch((e) => {
    console.error("[cifra-sync-admin] async failure", e);
  });

  return NextResponse.json(
    {
      ok: true,
      status: "queued",
      message:
        "Sync iniciado en background. Tarda ~2-5 minutos. Recarga la página o vuelve a pulsar 'Diagnosticar stock' tras un par de minutos para ver el resultado.",
    },
    { status: 202 },
  );
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const [last, productCount, variantCount] = await Promise.all([
    prisma.supplierSync.findUnique({ where: { supplier: "cifra" } }),
    prisma.product.count({ where: { supplier: "cifra" } }),
    prisma.productVariant.count({
      where: { product: { supplier: "cifra" } },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    lastSync: last,
    productCount,
    variantCount,
  });
}
