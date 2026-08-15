import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { type CotizarOk } from "./cotizar-core";
import {
  computeProposalTotals,
  cotizacionToProposalItem,
  type ProposalVariantSelection,
} from "./proposal-types";
import { generateProposalNumber } from "./proposal-number";
import { RecommenderProposalPdf } from "./recommender-proposal-pdf";
import { sendProposalEmail } from "./proposal-mailer";
import { signProposalToken } from "./proposal-token";
import { validateProposalOverride, type ProposalItemOverrideInput } from "./proposal-item-override";

/**
 * Puente cotización → Proposal formal. Fuente ÚNICA de la conversión de una
 * cotización (computeCotizacion) en una propuesta numerada con PDF: la usan el
 * cotizador del admin (envío inmediato) y la solicitud pública desde la ficha
 * de producto (crea BORRADOR para que el admin revise y envíe).
 *
 * El cliente NUNCA ve proveedor/coste: la línea usa publicRef (STM-XXX) y el
 * PVP final, con el envío incluido en el precio.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

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
  /**
   * Excepción comercial desde /admin/cotizar: sustituye concepto y/o precio
   * de la línea auto-calculada. Se valida como CONJUNTO (ver
   * proposal-item-override.ts) antes de tocar nada — un total roto aquí
   * facturaría gratis o mal en silencio.
   */
  itemOverride?: ProposalItemOverrideInput;
  /** Selección exacta solicitada en ficha; se conserva en quoteItems para revisión. */
  variantSelection?: ProposalVariantSelection;
};

export type CreateProposalResult =
  | { ok: true; proposalId: string; proposalNumber: string; downloadUrl: string; emailed: boolean; emailError?: string }
  | { ok: false; error: string };

export async function createProposalFromCotizacion(args: CreateProposalArgs): Promise<CreateProposalResult> {
  const { quote } = args;
  if (quote.pvp.baseTotal <= 0) return { ok: false, error: "El producto no tiene precio válido para cotizar." };

  const calculatedItem = cotizacionToProposalItem(quote);
  const baseItem = args.variantSelection
    ? { ...calculatedItem, variantSelection: args.variantSelection }
    : calculatedItem;
  let items = [baseItem];
  if (args.itemOverride) {
    const overrideError = validateProposalOverride(args.itemOverride);
    if (overrideError) return { ok: false, error: overrideError };
    items = [
      {
        ...baseItem,
        description: args.itemOverride.description.trim(),
        totalCents: args.itemOverride.totalCents,
        unitPriceCents: Math.round(args.itemOverride.totalCents / quote.qty),
        manualOverride: true,
        // El PDF sin breakdown suma unitPriceCents + markingPerUnitCents
        // (línea única todo-incluido) — a 0 porque unitPriceCents YA es el
        // precio final editado; si no, el marcaje se contaría dos veces.
        markingPerUnitCents: 0,
        markingSetupCents: 0,
        // El desglose producto/marcaje/cliché/envío ya no cuadra con un
        // total editado a mano — se omite y el PDF cae a la línea única.
        breakdown: undefined,
      },
    ];
  }
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
