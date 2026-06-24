import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/admin-auth";
import { FS_URL } from "@/lib/facturascripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/facturascripts
 *
 * Listado de pagos PAID y su estado de sincronización con FacturaScripts
 * (facturas.startidea.tech). Pensado para la pantalla de facturación: ver qué
 * pagos ya tienen factura, cuáles dieron error y cuáles están sin sincronizar,
 * y poder reintentar manualmente (POST /api/admin/facturascripts/sync).
 *
 * Roles: CEO + FACTURACION.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "FACTURACION");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  // Solo los PAID son facturables. Orden: los que necesitan acción primero
  // (error, luego sin sincronizar), después los ya sincronizados por fecha.
  const payments = await prisma.payment.findMany({
    where: { status: "PAID" },
    orderBy: [{ paidAt: "desc" }],
    take: 200,
    select: {
      id: true,
      amountCents: true,
      currency: true,
      kind: true,
      createdAt: true,
      paidAt: true,
      invoiceNumber: true,
      fsInvoiceCode: true,
      fsInvoiceId: true,
      fsSyncedAt: true,
      fsError: true,
      stripePaymentIntentId: true,
      cart: {
        select: { id: true, name: true, company: true, email: true, vatNumber: true },
      },
    },
  });

  const summary = {
    paid: payments.length,
    synced: payments.filter((p) => p.fsInvoiceCode).length,
    errored: payments.filter((p) => !p.fsInvoiceCode && p.fsError).length,
    pending: payments.filter((p) => !p.fsInvoiceCode && !p.fsError).length,
  };

  return NextResponse.json({
    ok: true,
    syncEnabled: process.env.FACTURASCRIPTS_SYNC_ENABLED === "true",
    fsUrl: FS_URL.replace(/\/api\/3$/, ""),
    summary,
    payments,
  });
}
