import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/affiliates/[id]/ledger
 *
 * Crea entry manual en el ledger. Útil para:
 *   - PAYOUT: marcar que se ha pagado X € de comisión (resta del saldo)
 *   - ADJUSTMENT: corrección manual con nota (signo positivo o negativo)
 *
 * Body:
 *   {
 *     kind: "PAYOUT" | "ADJUSTMENT",
 *     amountCents: number   (PAYOUT: positivo, se guarda en negativo. ADJUSTMENT: signo libre)
 *     note: string
 *   }
 */

const Schema = z.object({
  kind: z.enum(["PAYOUT", "ADJUSTMENT"]),
  amountCents: z.number().int().min(-1_000_000).max(1_000_000),
  note: z.string().min(2).max(500),
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

  // PAYOUT siempre se guarda en NEGATIVO (resta del saldo de comisión).
  // Cliente pasa positivo (intuitivo: "pago 250€"), aquí lo invertimos.
  const amount = d.kind === "PAYOUT" ? -Math.abs(d.amountCents) : d.amountCents;

  const entry = await prisma.affiliateLedgerEntry.create({
    data: {
      partnerId: id,
      kind: d.kind,
      amountCents: amount,
      createdBy: session.email,
      note: d.note,
    },
  });
  return NextResponse.json({ ok: true, entry });
}
