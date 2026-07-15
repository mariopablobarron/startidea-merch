/**
 * POST /api/admin/suppliers/midocean/sync-now
 *
 * Versión admin del cron-sync de MidOcean. Auth via cookie merch_admin
 * (no requiere CRON_SECRET). Mismo guard de concurrencia + fire-and-forget.
 *
 * Sync ~5-15 min en background. Estado consultable en SupplierSync.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { runMidoceanSync } from "@/lib/suppliers/midocean-sync";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";
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
  if (!(await acquireCronLock("supplier-sync:midocean", 45 * 60 * 1000))) {
    return NextResponse.json(
      { ok: false, status: "in_progress", message: "Ya hay un sync en curso. Espera unos minutos." },
      { status: 409 },
    );
  }

  void (async () => {
    try {
      await runMidoceanSync();
      await deactivateUnpricedProducts("midocean");
    } finally {
      await releaseCronLock("supplier-sync:midocean");
    }
  })().catch((e) => {
    console.error("[midocean-sync-admin] async failure", e);
  });

  return NextResponse.json(
    {
      ok: true,
      status: "queued",
      message:
        "Sync iniciado en background. Tarda ~5-15 minutos. Comprueba /admin/insights tras unos minutos para ver si subió el stock.",
    },
    { status: 202 },
  );
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const [last, productCount] = await Promise.all([
    prisma.supplierSync.findUnique({ where: { supplier: "midocean" } }),
    prisma.product.count({ where: { supplier: "midocean" } }),
  ]);
  return NextResponse.json({ ok: true, lastSync: last, productCount });
}
