import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { draftProposalFromCart } from "@/lib/auto-proposal";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/cart-quotes/[id]/draft-proposal
 *
 * Genera A MANO el borrador de propuesta de un carrito (status "draft"), para
 * los casos que el cron `auto-proposal` saltó: carritos de >72h, o que aún no
 * ha procesado. Reusa draftProposalFromCart() y enlaza la propuesta al carrito
 * (autoProposalId) para que el ProposalSendPanel muestre el envío en 1 clic.
 *
 * Idempotente: si el carrito ya tiene borrador vinculado, lo devuelve.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    select: { id: true, autoProposalId: true },
  });
  if (!cart) return NextResponse.json({ error: "Carrito no encontrado" }, { status: 404 });

  // Idempotente: si ya hay borrador vinculado, devolverlo
  if (cart.autoProposalId) {
    const existing = await prisma.proposal.findUnique({
      where: { id: cart.autoProposalId },
      select: { id: true, proposalNumber: true, status: true, sentAt: true, openedAt: true, acceptedAt: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadyExists: true,
        autoProposal: {
          id: existing.id,
          proposalNumber: existing.proposalNumber,
          status: existing.status,
          sentAt: existing.sentAt ? existing.sentAt.toISOString() : null,
          openedAt: existing.openedAt ? existing.openedAt.toISOString() : null,
          acceptedAt: existing.acceptedAt ? existing.acceptedAt.toISOString() : null,
        },
      });
    }
  }

  let result;
  try {
    result = await draftProposalFromCart(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const sinPrecio = /precio|items/i.test(msg);
    return NextResponse.json(
      {
        error: sinPrecio
          ? "Este carrito no tiene productos con precio. Cotiza con el cotizador y envía la propuesta desde allí."
          : "No se pudo generar el borrador.",
      },
      { status: 422 },
    );
  }

  await prisma.cartQuote.update({
    where: { id },
    data: { autoProposalId: result.proposalId, autoProposalAt: new Date() },
  });

  void notifyTelegram(
    `📄 Borrador <b>${result.proposalNumber}</b> generado a mano desde el carrito ${id.slice(0, 8)} — revisar y enviar en /admin/cart-quotes.`,
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    autoProposal: {
      id: result.proposalId,
      proposalNumber: result.proposalNumber,
      status: "draft",
      sentAt: null,
      openedAt: null,
      acceptedAt: null,
    },
  });
}
