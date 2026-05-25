import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getAffiliateBalance } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/affiliates/[id]/ledger
 *
 * Crea entry manual en el ledger. Útil para:
 *   - PAYOUT: marcar que se ha pagado X € de comisión (resta del saldo de comisión)
 *   - CREDIT_USED: el afiliado usa parte de su crédito en su propio pedido
 *                  (resta del saldo de crédito)
 *   - ADJUSTMENT: corrección manual con nota (signo positivo o negativo)
 *
 * PAYOUT y CREDIT_USED se reciben con importe POSITIVO (intuitivo: "pago 250€",
 * "uso 80€ de crédito") y se guardan en NEGATIVO.
 * ADJUSTMENT acepta signo libre.
 *
 * Validaciones:
 *   - PAYOUT no puede exceder commissionPending actual.
 *   - CREDIT_USED no puede exceder creditAvailable actual.
 *   - cartId opcional para trazabilidad (qué pedido consumió el crédito).
 *
 * Body:
 *   {
 *     kind: "PAYOUT" | "ADJUSTMENT" | "CREDIT_USED",
 *     amountCents: number,
 *     note: string,
 *     cartId?: string
 *   }
 */

const Schema = z.object({
  kind: z.enum(["PAYOUT", "ADJUSTMENT", "CREDIT_USED"]),
  amountCents: z.number().int().min(-1_000_000).max(1_000_000),
  note: z.string().min(2).max(500),
  cartId: z.string().min(1).max(64).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Cap PAYOUT / CREDIT_USED contra los saldos actuales (no se permite ir a
  // negativo). ADJUSTMENT puede ser cualquier cosa (es justamente para
  // correcciones libres).
  if (d.kind === "PAYOUT" || d.kind === "CREDIT_USED") {
    const balance = await getAffiliateBalance(id);
    const requested = Math.abs(d.amountCents);
    const cap = d.kind === "PAYOUT" ? balance.commissionPending : balance.creditAvailable;
    if (cap <= 0) {
      return NextResponse.json(
        { error: d.kind === "PAYOUT" ? "Sin comisión pendiente" : "Sin crédito disponible" },
        { status: 400 },
      );
    }
    if (requested > cap) {
      return NextResponse.json(
        {
          error:
            d.kind === "PAYOUT"
              ? `Excede el saldo pendiente (${(cap / 100).toFixed(2)}€)`
              : `Excede el crédito disponible (${(cap / 100).toFixed(2)}€)`,
        },
        { status: 400 },
      );
    }
  }

  // PAYOUT y CREDIT_USED se guardan SIEMPRE en negativo (restan del saldo).
  // Cliente pasa positivo (intuitivo); aquí lo invertimos.
  const amount =
    d.kind === "PAYOUT" || d.kind === "CREDIT_USED"
      ? -Math.abs(d.amountCents)
      : d.amountCents;

  const entry = await prisma.affiliateLedgerEntry.create({
    data: {
      partnerId: id,
      kind: d.kind,
      amountCents: amount,
      cartId: d.cartId,
      createdBy: session.email,
      note: d.note,
    },
  });
  return NextResponse.json({ ok: true, entry });
}
