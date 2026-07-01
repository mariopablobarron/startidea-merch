import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { deliverProposal } from "@/lib/proposal-deliver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/proposals/[id]/resend
 *
 * REENVÍA al cliente una propuesta YA enviada (el cliente la perdió, no llegó,
 * quiere revisarla otra vez). Re-renderiza el PDF actual desde quoteItems y lo
 * manda de nuevo por email, refrescando sentAt/resendId SIN degradar el estado
 * (sent/opened/accepted se conservan).
 *
 * Para el primer envío de un BORRADOR usar /send-to-client (aquí devuelve 409).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  if (proposal.status === "draft") {
    return NextResponse.json(
      { error: "Es un borrador sin enviar. Usa «Enviar al cliente»." },
      { status: 409 },
    );
  }

  const result = await deliverProposal(proposal, session.email, { resend: true });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    proposalNumber: result.proposalNumber,
    sentTo: result.sentTo,
  });
}
