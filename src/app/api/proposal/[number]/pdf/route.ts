/**
 * GET /api/proposal/[number]/pdf?token=<hmac>
 *
 * Regenera el PDF on-the-fly desde la propuesta persistida y lo
 * devuelve. Protegido por HMAC token (signProposalToken) con
 * expiración 30 días.
 *
 * También marca `openedAt` la primera vez que se descarga, para que
 * el admin sepa si el cliente abrió la propuesta.
 */
import { createElement, type ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { escapeTgHtml, notifyTelegram } from "@/lib/telegram";
import { verifyProposalToken } from "@/lib/proposal-token";
import {
  computeProposalTotals,
  type ProposalQuoteItem,
} from "@/lib/proposal-types";
import { RecommenderProposalPdf } from "@/lib/recommender-proposal-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 401 });
  }

  const verified = verifyProposalToken(token);
  if (!verified.valid) {
    return NextResponse.json(
      { error: "INVALID_TOKEN", reason: verified.reason },
      { status: 401 },
    );
  }

  const proposal = await prisma.proposal.findFirst({
    where: {
      id: verified.proposalId,
      proposalNumber: number,
    },
  });

  if (!proposal) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Marcar openedAt si no estaba — salvo que la descarga venga de un admin
  // (David previsualizando desde /admin/propuestas no cuenta como apertura
  // del cliente; sin esta exclusión el tracking daba falsos "Abierta").
  if (!proposal.openedAt) {
    const adminSession = await authenticateAdminRequest(req).catch(() => null);
    if (!adminSession) {
      try {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: {
            openedAt: new Date(),
            status: proposal.status === "sent" ? "opened" : proposal.status,
          },
        });
        void notifyTelegram(
          `👀 <b>Propuesta abierta</b>\n${proposal.proposalNumber} · ${escapeTgHtml(proposal.email)}` +
            (proposal.company ? ` (${escapeTgHtml(proposal.company)})` : "") +
            `\nTotal: ${(proposal.totalCents / 100).toFixed(2)} €`,
        ).catch(() => {});
      } catch {
        // No crítico
      }
    }
  }

  const items = proposal.quoteItems as unknown as ProposalQuoteItem[];
  const totals = computeProposalTotals(items);

  try {
    const pdfBuffer = await renderToBuffer(
      createElement(RecommenderProposalPdf, {
        proposalNumber: proposal.proposalNumber,
        date: proposal.sentAt,
        email: proposal.email,
        name: proposal.name,
        company: proposal.company,
        items,
        totals,
      }) as unknown as ReactElement<DocumentProps>,
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${proposal.proposalNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "PDF_RENDER_FAILED",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
