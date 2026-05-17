import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { createPurchaseOrdersFromCart } from "@/lib/purchase-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cart-quotes/[id]/split
 *
 * Dispara manualmente el split del cart en PurchaseOrders.
 * Normalmente lo hace el webhook Stripe tras checkout.session.completed,
 * pero este endpoint sirve para:
 *  - Backfill de carts legacy (antes del modelo PO)
 *  - Reintentar si el webhook falló
 *  - Casos manuales (cliente paga por transferencia y admin marca como ORDERED)
 *
 * Idempotente: si ya hay POs cubriendo todos los items, no crea de nuevo.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const pos = await createPurchaseOrdersFromCart(id);
  return NextResponse.json({
    ok: true,
    cartId: id,
    purchaseOrders: pos.map((p) => ({
      id: p.id,
      supplier: p.supplier,
      status: p.status,
      totalClientCents: p.totalClientCents,
      estimatedDeliveryDate: p.estimatedDeliveryDate,
    })),
  });
}
