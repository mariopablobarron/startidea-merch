/**
 * POST /api/admin/suppliers/makito/sync-legacy
 *
 * Versión admin del cron-sync de Makito legacy (data.makito.es XML feeds).
 * Auth via cookie merch_admin. Mismo guard de concurrencia + fire-and-forget.
 *
 * Es "legacy" para distinguir del sync B2B nuevo (Fase 3 pendiente).
 * Por ahora el legacy es el único que rellena la BD.
 *
 * Sync ~5-13 min en background.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { runMakitoSync } from "@/lib/suppliers/makito-sync";
import { deactivateUnpricedProducts } from "@/lib/suppliers/sweep";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const last = await prisma.supplierSync.findUnique({ where: { supplier: "makito" } });
  const inProgress =
    last && !last.finishedAt && Date.now() - last.startedAt.getTime() < 15 * 60 * 1000;
  if (inProgress) {
    return NextResponse.json(
      {
        ok: false,
        status: "in_progress",
        startedAt: last.startedAt,
        message: "Ya hay un sync en curso. Espera unos minutos.",
      },
      { status: 409 },
    );
  }

  void (async () => {
    await runMakitoSync();
    await deactivateUnpricedProducts("makito");
  })().catch((e) => {
    console.error("[makito-sync-admin] async failure", e);
  });

  return NextResponse.json(
    {
      ok: true,
      status: "queued",
      message:
        "Sync legacy iniciado en background. Tarda ~5-13 minutos. El XML de Makito es pesado (17MB).",
    },
    { status: 202 },
  );
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const [last, productCount] = await Promise.all([
    prisma.supplierSync.findUnique({ where: { supplier: "makito" } }),
    prisma.product.count({ where: { supplier: "makito" } }),
  ]);
  return NextResponse.json({ ok: true, lastSync: last, productCount });
}
