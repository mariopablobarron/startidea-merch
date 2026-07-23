import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeProposalTotals, type ProposalQuoteItem } from "@/lib/proposal-types";
import { generateProposalNumber } from "@/lib/proposal-number";
import { signProposalToken } from "@/lib/proposal-token";
import { RecommenderProposalPdf } from "@/lib/recommender-proposal-pdf";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export type CartDraftResult = {
  proposalId: string;
  proposalNumber: string;
  downloadUrl: string;
  subtotalCents: number;
  totalCents: number;
  itemCount: number;
};

/**
 * Convierte un CartQuote (con items ya configurados y con precio por el
 * cliente) en una Proposal BORRADOR (status "draft") + PDF, reutilizando el
 * mismo pipeline que el recomendador.
 *
 * NO envía nada al cliente: deja la propuesta en estado "draft" para que el
 * admin la revise y la mande con 1 clic (modo semi-auto del agente 24h).
 *
 * Coherencia de IVA: los precios del carrito son base imponible (sin IVA);
 * computeProposalTotals añade 21% encima, igual que ve el cliente en el
 * recomendador. Mapeamos totalClientCents → totalCents 1:1 (sin doble IVA).
 */
export async function draftProposalFromCart(cartId: string): Promise<CartDraftResult> {
  const cart = await prisma.cartQuote.findUnique({
    where: { id: cartId },
    include: { items: true },
  });
  if (!cart) throw new Error(`CartQuote ${cartId} no encontrado`);
  if (cart.items.length === 0) throw new Error("Carrito sin items");

  const items: ProposalQuoteItem[] = cart.items.map((it) => {
    const priced = typeof it.totalClientCents === "number" && it.totalClientCents > 0;
    return {
      description: it.productName,
      notFound: !priced,
      quantity: it.quantity,
      sizes: null,
      technique: it.markingTechniqueName ?? null,
      colorRequested: it.colorName ?? null,
      product: {
        slug: it.productSlug,
        name: it.productName,
        ref: it.productRef,
        url: `${SITE_URL}/catalogo/${it.productSlug}`,
        primaryImageUrl: it.primaryImageUrl ?? null,
      },
      unitPriceCents: it.unitPriceClientCents ?? null,
      // El total del carrito ya incluye el marcaje → no lo desglosamos aparte.
      markingPerUnitCents: 0,
      markingSetupCents: 0,
      totalCents: priced ? it.totalClientCents : null,
      priceSource: "tier",
    };
  });

  const totals = computeProposalTotals(items);
  if (totals.subtotalCents <= 0) throw new Error("Carrito sin items con precio");

  const proposalNumber = await generateProposalNumber();
  const now = new Date();

  // Renderizamos el PDF como validación (que no reviente al pulsar el cliente).
  // No persistimos el buffer: el endpoint /api/proposal/[number]/pdf lo
  // re-genera bajo demanda desde quoteItems.
  await renderToBuffer(
    createElement(RecommenderProposalPdf, {
      proposalNumber,
      date: now,
      email: cart.email,
      name: cart.name ?? null,
      company: cart.company ?? null,
      items,
      totals,
    }) as unknown as ReactElement<DocumentProps>,
  );

  const created = await prisma.proposal.create({
    data: {
      proposalNumber,
      email: cart.email,
      name: cart.name ?? null,
      company: cart.company ?? null,
      quoteItems: items as unknown as Prisma.InputJsonValue,
      subtotalCents: totals.subtotalCents,
      ivaCents: totals.ivaCents,
      totalCents: totals.totalCents,
      status: "draft", // NO enviado — el admin lo revisa y manda con 1 clic
      cartQuoteId: cartId, // enlace bidireccional carrito↔propuesta
    },
    select: { id: true },
  });

  const token = signProposalToken(created.id);
  const downloadUrl = `${SITE_URL}/api/proposal/${encodeURIComponent(proposalNumber)}/pdf?token=${encodeURIComponent(token)}`;

  return {
    proposalId: created.id,
    proposalNumber,
    downloadUrl,
    subtotalCents: totals.subtotalCents,
    totalCents: totals.totalCents,
    itemCount: items.filter((i) => !i.notFound).length,
  };
}
