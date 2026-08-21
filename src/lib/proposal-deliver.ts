import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { Proposal } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeProposalTotals, type ProposalQuoteItem } from "@/lib/proposal-types";
import { signProposalToken } from "@/lib/proposal-token";
import { RecommenderProposalPdf } from "@/lib/recommender-proposal-pdf";
import { sendProposalEmail } from "@/lib/proposal-mailer";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export type DeliverResult =
  | { ok: true; proposalNumber: string; sentTo: string }
  | { ok: false; status: number; error: string; detail?: string };

/**
 * Renderiza el PDF de una propuesta desde sus quoteItems y lo envía por email
 * al cliente. Núcleo compartido por:
 *   - send-to-client (primer envío de un BORRADOR: draft→sent + carrito NEW→SENT)
 *   - resend (reenvío de una propuesta ya enviada: refresca sentAt/resendId, no
 *     cambia el estado).
 *
 * El caller decide qué estados admite ANTES de llamar; aquí solo se distingue
 * draft (primer envío) del resto (reenvío) para no degradar el estado.
 */
export async function deliverProposal(
  proposal: Proposal,
  actorEmail: string,
  opts: { resend?: boolean } = {},
): Promise<DeliverResult> {
  const items = proposal.quoteItems as unknown as ProposalQuoteItem[];
  const totals = computeProposalTotals(items);
  if (totals.subtotalCents <= 0) {
    return { ok: false, status: 400, error: "Propuesta sin items con precio" };
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
    return {
      ok: false,
      status: 500,
      error: "PDF_RENDER_FAILED",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  const token = signProposalToken(proposal.id);
  const num = encodeURIComponent(proposal.proposalNumber);
  const tok = encodeURIComponent(token);
  const downloadUrl = `${SITE_URL}/api/proposal/${num}/pdf?token=${tok}`;
  const acceptUrl = `${SITE_URL}/api/proposal/${num}/accept?token=${tok}`;

  const emailResult = await sendProposalEmail({
    proposalNumber: proposal.proposalNumber,
    toEmail: proposal.email,
    name: proposal.name,
    totals,
    downloadUrl,
    acceptUrl,
    pdfBuffer,
  });
  if (!emailResult.ok) {
    return { ok: false, status: 502, error: "EMAIL_FAILED", detail: emailResult.error };
  }

  if (proposal.status === "draft") {
    // Primer envío: marca enviada + pasa el carrito vinculado a SENT. Cubre tanto
    // los carritos del recomendador (NEW) como los del cotizador admin (IN_PROGRESS),
    // que ahora también reciben borrador automático del agente 24h.
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: "sent", sentAt: now, resendId: emailResult.id },
    });
    await prisma.cartQuote.updateMany({
      where: { autoProposalId: proposal.id, status: { in: ["NEW", "IN_PROGRESS"] } },
      data: { status: "SENT" },
    });
  } else {
    // Reenvío: no degradar el estado (sent/opened/accepted), solo refrescar traza.
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { sentAt: now, resendId: emailResult.id },
    });
  }

  const verb = opts.resend ? "reenviada" : "enviada";
  void notifyTelegram(
    `📤 <b>Propuesta ${verb}</b> (${proposal.proposalNumber})\n→ ${escapeTgHtml(proposal.email)}\nPor: ${escapeTgHtml(actorEmail)}`,
  ).catch(() => {});

  return { ok: true, proposalNumber: proposal.proposalNumber, sentTo: proposal.email };
}
