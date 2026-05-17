import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["PENDING", "PLACED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELED", "FAILED"]).optional(),
  supplierOrderRef: z.string().max(120).optional().nullable(),
  estimatedDeliveryDate: z.string().datetime().optional().nullable(),
  trackingCarrier: z.string().max(80).optional().nullable(),
  trackingNumber: z.string().max(80).optional().nullable(),
  trackingUrl: z.string().max(500).optional().nullable(),
  internalNotes: z.string().max(4000).optional().nullable(),
});

/**
 * Admin actualiza un PurchaseOrder: cambiar estado, añadir tracking, notas.
 * Útil sobre todo para POs de proveedores sin integración auto (Makito, etc.).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  for (const k of ["supplierOrderRef", "trackingCarrier", "trackingNumber", "trackingUrl", "internalNotes"] as const) {
    if (d[k] !== undefined) data[k] = d[k] || null;
  }
  if (d.estimatedDeliveryDate !== undefined) {
    data.estimatedDeliveryDate = d.estimatedDeliveryDate ? new Date(d.estimatedDeliveryDate) : null;
  }
  if (d.status !== undefined) {
    data.status = d.status;
    // Si pasa a SHIPPED, sello fecha; si DELIVERED, sello fecha; si PLACED, placedAt
    if (d.status === "SHIPPED") data.shippedAt = new Date();
    if (d.status === "DELIVERED") data.deliveredAt = new Date();
    if (d.status === "PLACED" && !data.placedAt) data.placedAt = new Date();
  }

  const updated = await prisma.purchaseOrder.update({ where: { id }, data });
  return NextResponse.json({ ok: true, purchaseOrder: updated });
}
