import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/admin-auth";
import { syncPaymentToFacturaScripts } from "@/lib/facturascripts-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/facturascripts/sync  { paymentId }
 *
 * Sincroniza (o reintenta) un pago concreto con FacturaScripts. Es una acción
 * MANUAL del admin, así que NO depende de FACTURASCRIPTS_SYNC_ENABLED (igual que
 * simulate-payment): el operador decide explícitamente emitir/reintentar.
 * Idempotente: si el pago ya tiene factura, devuelve la existente sin duplicar.
 *
 * Roles: CEO + FACTURACION.
 */
const Schema = z.object({ paymentId: z.string().min(1).max(40) });

export async function POST(req: Request) {
  const auth = await requireRole(req, "FACTURACION");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Falta paymentId" }, { status: 400 });

  const result = await syncPaymentToFacturaScripts(parsed.data.paymentId);
  // result ya es {ok:true,...} | {ok:false, error}. Lo devolvemos tal cual; HTTP
  // 200 siempre (el error funcional va en el cuerpo, lo pinta la UI).
  return NextResponse.json(result);
}
