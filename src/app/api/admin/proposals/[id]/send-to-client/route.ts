import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { computeProposalTotals, type ProposalQuoteItem } from "@/lib/proposal-types";
import { signProposalToken } from "@/lib/proposal-token";
import { RecommenderProposalPdf } from "@/lib/recommender-proposal-pdf";
import { sendProposalEmail } from "@/lib/proposal-mailer";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * POST /api/admin/proposals/[id]/send-to-client
 *
 * Envío 1-clic de una propuesta BORRADOR (generada por el agente auto-proposal)
 * al cliente. Re-renderiza el PDF desde quoteItems, lo manda por email con
 * Resend, marca status draft→sent y pasa el carrito vinculado a SENT.
 *
 * Idempotente: si la propuesta ya no es "draft", devuelve 409 (no reenvía).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  if (proposal.status !== "draft") {
    return NextResponse.json(
      { error: "La propuesta ya no es un borrador (¿ya enviada?)" },
      { status: 409 },
    );
  }

  const items = proposal.quoteItems as unknown as ProposalQuoteItem[];
  const totals = computeProposalTotals(items);
  if (totals.subtotalCents <= 0) {
    return NextResponse.json({ error: "Propuesta sin items con precio" }, { status: 400 });
  }
  const now = new Date();

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      createElement(RecommenderProposalPdf, {
        proposalNumber: proposal.proposalNumber,
        date: now,
        email: proposal.email,
        name: proposal.name,
        company: proposal.company,
        items,
        totals,
      }) as unknown as ReactElement<DocumentProps>,
    );
  } catch (e) {
    return NextResponse.json(
      { error: "PDF_RENDER_FAILED", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const token = signProposalToken(proposal.id);
  const downloadUrl = `${SITE_URL}/api/proposal/${encodeURIComponent(proposal.proposalNumber)}/pdf?token=${encodeURIComponent(token)}`;

  const emailResult = await sendProposalEmail({
    proposalNumber: proposal.proposalNumber,
    toEmail: proposal.email,
    name: proposal.name,
    totals,
    downloadUrl,
    pdfBuffer,
  });
  if (!emailResult.ok) {
    return NextResponse.json({ error: "EMAIL_FAILED", detail: emailResult.error }, { status: 502 });
  }

  // Marcar enviada + pasar el carrito vinculado a SENT (si lo hay y sigue NEW).
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: { status: "sent", sentAt: now, resendId: emailResult.id },
  });
  await prisma.cartQuote.updateMany({
    where: { autoProposalId: proposal.id, status: "NEW" },
    data: { status: "SENT" },
  });

  void notifyTelegram(
    `📤 <b>Propuesta enviada</b> (${proposal.proposalNumber})\n→ ${proposal.email}\nPor: ${session.email}`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    proposalNumber: proposal.proposalNumber,
    sentTo: proposal.email,
  });
}
