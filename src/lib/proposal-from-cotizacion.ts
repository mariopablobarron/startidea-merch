import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { type CotizarOk } from "./cotizar-core";
import { computeProposalTotals, type ProposalQuoteItem } from "./proposal-types";
import { generateProposalNumber } from "./proposal-number";
import { RecommenderProposalPdf } from "./recommender-proposal-pdf";
import { sendProposalEmail } from "./proposal-mailer";
import { signProposalToken } from "./proposal-token";

/**
 * Puente cotización → Proposal formal. Fuente ÚNICA de la conversión de una
 * cotización (computeCotizacion) en una propuesta numerada con PDF: la usan el
 * cotizador del admin (envío inmediato) y la solicitud pública desde la ficha
 * de producto (crea BORRADOR para que el admin revise y envíe).
 *
 * El cliente NUNCA ve proveedor/coste: la línea usa publicRef (STM-XXX) y el
 * PVP final, con el envío incluido en el precio.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

/** Una línea todo-incluido (producto+marcaje+portes ya en el total). */
export function cotizacionToProposalItem(quote: CotizarOk): ProposalQuoteItem {
  return {
    description: quote.product.name,
    notFound: false,
    quantity: quote.qty,
    sizes: null,
    technique: quote.marking?.techniqueLabel ?? null,
    colorRequested: null,
    product: {
      slug: quote.product.slug,
      name: quote.product.name,
      ref: quote.product.publicRef, // STM-XXX / slug — NUNCA supplierRef
      url: `${SITE_URL}/catalogo/${quote.product.slug}`,
      primaryImageUrl: quote.product.imageUrl,
    },
    unitPriceCents: Math.round(quote.pvp.baseTotal / quote.qty),
    markingPerUnitCents: 0,
    markingSetupCents: 0,
    totalCents: quote.pvp.baseTotal,
    priceSource: quote.product.hasRealPricing ? "tier" : "estimate",
  };
}

export type CreateProposalArgs = {
  quote: CotizarOk;
  email: string;
  name?: string | null;
  company?: string | null;
  /** "draft" → review-first (el admin la envía luego con 1 clic). "sent" → ya enviada. */
  status?: "draft" | "sent";
  /** Si true, envía el email al cliente con el PDF adjunto. */
  send?: boolean;
  ip?: string | null;
  ua?: string | null;
};

export type CreateProposalResult =
  | { ok: true; proposalId: string; proposalNumber: string; downloadUrl: string; emailed: boolean; emailError?: string }
  | { ok: false; error: string };

export async function createProposalFromCotizacion(args: CreateProposalArgs): Promise<CreateProposalResult> {
  const { quote } = args;
  if (quote.pvp.baseTotal <= 0) return { ok: false, error: "El producto no tiene precio válido para cotizar." };

  const items = [cotizacionToProposalItem(quote)];
  const totals = computeProposalTotals(items);

  let proposalNumber: string;
  try {
    proposalNumber = await generateProposalNumber();
  } catch {
    return { ok: false, error: "No se pudo generar el número de propuesta." };
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      createElement(RecommenderProposalPdf, {
        proposalNumber,
        date: new Date(),
        email: args.email,
        name: args.name ?? null,
        company: args.company ?? null,
        items,
        totals,
      }) as unknown as ReactElement<DocumentProps>,
    );
  } catch {
    return { ok: false, error: "No se pudo generar el PDF de la propuesta." };
  }

  let proposalId: string;
  try {
    const created = await prisma.proposal.create({
      data: {
        proposalNumber,
        email: args.email,
        name: args.name ?? null,
        company: args.company ?? null,
        quoteItems: items as unknown as Prisma.InputJsonValue,
        subtotalCents: totals.subtotalCents,
        ivaCents: totals.ivaCents,
        totalCents: totals.totalCents,
        status: args.status ?? "sent",
        recommenderQueryId: null,
        ip: args.ip ?? null,
        ua: args.ua ?? null,
      },
      select: { id: true },
    });
    proposalId = created.id;
  } catch {
    return { ok: false, error: "No se pudo guardar la propuesta." };
  }

  const token = signProposalToken(proposalId);
  const downloadUrl = `${SITE_URL}/api/proposal/${encodeURIComponent(proposalNumber)}/pdf?token=${encodeURIComponent(token)}`;

  let emailed = false;
  let emailError: string | undefined;
  if (args.send) {
    const sent = await sendProposalEmail({
      proposalNumber,
      toEmail: args.email,
      name: args.name ?? null,
      totals,
      downloadUrl,
      pdfBuffer,
    });
    if (sent.ok) {
      emailed = true;
      await prisma.proposal.update({ where: { id: proposalId }, data: { resendId: sent.id } }).catch(() => {});
    } else {
      emailError = sent.error;
    }
  }

  return { ok: true, proposalId, proposalNumber, downloadUrl, emailed, ...(emailError ? { emailError } : {}) };
}
