import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { wrapCronHandler } from "@/lib/cron-tracking";
import { draftProposalFromCart } from "@/lib/auto-proposal";
import { notifyTelegram } from "@/lib/telegram";
import { notifyAdmins } from "@/lib/notify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const MIN_AGE_MIN = 3; // gracia: el cliente puede seguir configurando el carrito
const MAX_AGE_HOURS = 72; // no procesar carritos antiguos
const BATCH_LIMIT = 10; // por ejecución (evita picos de CPU/render PDF)

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/**
 * Agente 24h de propuestas — modo SEMI-AUTO.
 *
 * Cada N minutos (cron del VPS), por cada CartQuote nuevo con precio:
 *   1. Genera una Proposal BORRADOR + PDF (draftProposalFromCart).
 *   2. Avisa al admin (Telegram + push) con el PDF y el link de revisión.
 * NO envía nada al cliente: el admin revisa y manda con 1 clic.
 *
 * DEDUP ROBUSTO: claim atómico con updateMany(where autoProposalAt:null) antes
 * de generar, así dos ejecuciones solapadas nunca generan/avisan dos veces.
 * (Lección de los incidentes de spam de cron: no fiarse de la periodicidad.)
 */
export const POST = wrapCronHandler("auto-proposal", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const now = Date.now();
  const minBefore = new Date(now - MIN_AGE_MIN * 60_000);
  const maxBefore = new Date(now - MAX_AGE_HOURS * 3_600_000);

  const candidates = await prisma.cartQuote.findMany({
    where: {
      // NEW = recomendador/carrito público. IN_PROGRESS + source=admin-cotizador =
      // presupuestos que el comercial guarda en /admin/cotizar, que también quieren
      // borrador automático. NO ampliamos a TODOS los IN_PROGRESS a propósito: el
      // ai-quote-builder también nace IN_PROGRESS pero tiene su propio flujo.
      OR: [
        { status: "NEW" },
        { status: "IN_PROGRESS", source: "admin-cotizador" },
      ],
      autoProposalAt: null, // dedup: aún sin borrador
      createdAt: { lte: minBefore, gte: maxBefore },
      items: { some: { totalClientCents: { gt: 0 } } },
    },
    select: { id: true, name: true, company: true },
    orderBy: { createdAt: "asc" },
    take: BATCH_LIMIT,
  });

  const results: { cartId: string; ok: boolean; proposalNumber?: string; error?: string }[] = [];

  for (const cart of candidates) {
    // CLAIM atómico — marca autoProposalAt YA. Si otra ejecución lo reclamó
    // entre el find y el update, count=0 y lo saltamos.
    const claim = await prisma.cartQuote.updateMany({
      where: { id: cart.id, autoProposalAt: null },
      data: { autoProposalAt: new Date() },
    });
    if (claim.count === 0) continue;

    try {
      const draft = await draftProposalFromCart(cart.id);
      await prisma.cartQuote.update({
        where: { id: cart.id },
        data: { autoProposalId: draft.proposalId },
      });

      const who = `${cart.name}${cart.company ? ` · ${cart.company}` : ""}`;
      void notifyTelegram(
        `🤖 <b>Propuesta borrador lista</b> (${draft.proposalNumber})\n` +
          `${who}\n` +
          `${draft.itemCount} producto${draft.itemCount === 1 ? "" : "s"} · <b>${EUR.format(draft.totalCents / 100)}</b> (IVA incl.)\n` +
          `📄 PDF: ${draft.downloadUrl}\n` +
          `✍️ Revisar y enviar (1 clic): ${SITE_URL}/admin/propuestas`,
      ).catch(() => {});
      void notifyAdmins({
        title: `🤖 Propuesta lista para ${cart.name}`,
        body: `${draft.itemCount} prod. · ${EUR.format(draft.totalCents / 100)} — revisar y enviar`,
        url: `/admin/propuestas`,
        tag: `auto-proposal-${cart.id}`,
      }).catch(() => {});

      results.push({ cartId: cart.id, ok: true, proposalNumber: draft.proposalNumber });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // No des-reclamamos: evita reintentos infinitos + spam. Avisamos del fallo
      // para que el admin lo haga a mano si hace falta.
      void notifyTelegram(
        `⚠️ <b>auto-proposal FALLÓ</b>\nCart ${cart.id.slice(0, 8)} · ${cart.name}\n${msg.slice(0, 200)}`,
      ).catch(() => {});
      results.push({ cartId: cart.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    drafted: results.filter((r) => r.ok).length,
    results,
  });
});
