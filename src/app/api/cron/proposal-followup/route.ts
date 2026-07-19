import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronSecret } from "@/lib/auth";
import { resend, RESEND_FROM } from "@/lib/resend";
import { signProposalToken } from "@/lib/proposal-token";
import { withCronLock } from "@/lib/cron-lock";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const DAY = 24 * 60 * 60 * 1000;

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

// Estados de carrito ya resueltos — no se sigue insistiendo.
const RESOLVED_CART = ["CONFIRMED", "ORDERED", "LOST", "ARCHIVED"];

/**
 * Seguimiento de PROPUESTAS enviadas como PDF y sin responder.
 *
 * Hueco simétrico a quote-followup: aquí el cliente recibió la propuesta
 * (status sent/opened) pero aún NO hay enlace de pago ni aceptación. Si más
 * adelante se le manda enlace de pago, quote-followup toma el relevo (aquí se
 * salta para no duplicar).
 *
 *   D3 (#1): "¿pudiste verla?" + re-descarga del PDF
 *   D7 (#2): último aviso + oferta de ajustar/cerrar
 *
 * Dedup por Proposal.followupCount (0→1→2). Máx 2 follow-ups. 1 email por
 * propuesta y ejecución.
 *
 * Llamar 1x/día:  POST /api/cron/proposal-followup  (Header X-Cron-Secret)
 */
export const POST = wrapCronHandler("proposal-followup", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  // Lock como sus crons hermanos (quote-followup/review-invite): dos
  // invocaciones solapadas duplicaban el email de seguimiento al cliente.
  return withCronLock("proposal-followup", () => run()) as Promise<NextResponse>;
});

async function run(): Promise<Response> {
  const now = Date.now();
  const sent = { d3: 0, d7: 0 };
  const errors: string[] = [];

  const proposals = await prisma.proposal.findMany({
    where: {
      status: { in: ["sent", "opened"] },
      acceptedAt: null,
      followupCount: { lt: 2 },
    },
    select: {
      id: true,
      proposalNumber: true,
      email: true,
      name: true,
      sentAt: true,
      totalCents: true,
      followupCount: true,
    },
    take: 300,
  });

  for (const p of proposals) {
    const ageDays = (now - p.sentAt.getTime()) / DAY;
    let step: 1 | 2 | null = null;
    if (p.followupCount === 0 && ageDays >= 3) step = 1;
    else if (p.followupCount === 1 && ageDays >= 7) step = 2;
    if (!step) continue;

    // Si el carrito vinculado ya tiene enlace de pago, lo persigue quote-followup.
    // Si está resuelto (pagado/perdido/archivado), no insistir.
    const cart = await prisma.cartQuote.findFirst({
      where: { autoProposalId: p.id },
      select: { status: true, paymentLinkToken: true },
    });
    if (cart && (cart.paymentLinkToken || RESOLVED_CART.includes(cart.status))) continue;

    if (!resend) {
      errors.push(`proposal ${p.id}: Resend no configurado`);
      break;
    }

    try {
      // Claim atómico ANTES de enviar (cinturón además del lock): si otra
      // ejecución ya subió followupCount, count=0 y no se duplica el email.
      const claim = await prisma.proposal.updateMany({
        where: { id: p.id, followupCount: p.followupCount },
        data: { followupCount: step, lastFollowupAt: new Date() },
      });
      if (claim.count === 0) continue;
      await sendReminder(p, step);
      if (step === 1) sent.d3++;
      else sent.d7++;
    } catch (e) {
      errors.push(`proposal ${p.id} step ${step}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}

async function sendReminder(
  p: { id: string; proposalNumber: string; email: string; name: string | null; totalCents: number },
  step: 1 | 2,
) {
  const firstName = (p.name || "").split(" ")[0] || "";
  const token = signProposalToken(p.id);
  const pdfUrl = `${SITE_URL}/api/proposal/${encodeURIComponent(p.proposalNumber)}/pdf?token=${encodeURIComponent(token)}`;
  const totalLine = p.totalCents
    ? `<p style="margin-top:8px;font-size:15px;color:#0a0a0b;">Total propuesta (IVA incl.): <strong>${EUR.format(p.totalCents / 100)}</strong></p>`
    : "";

  let subject: string;
  let lead: string;
  let extraBlock = "";
  if (step === 1) {
    subject = `${firstName ? firstName + ", ¿" : "¿"}pudiste ver la propuesta ${p.proposalNumber}?`;
    lead =
      "Te dejamos de nuevo a mano la propuesta que te preparamos, por si se traspapeló. Si encaja o quieres ajustar cantidades, plazos o acabados, respóndenos y lo cerramos en un momento.";
  } else {
    subject = `${firstName ? firstName + ", ú" : "Ú"}ltima sobre la propuesta ${p.proposalNumber}`;
    lead =
      "Es la última vez que te escribimos sobre esta propuesta. Si te interesa, te preparamos el enlace de pago o ajustamos lo que necesites; si no, no te preocupes.";
    extraBlock = `
      <p style="margin:20px 0;padding:14px;background:#f1ede5;border-radius:8px;font-size:14px;color:#444;">
        💬 ¿Dudas con presupuesto o plazos? Responde a este email y un asesor te atiende.
      </p>`;
  }

  await resend!.emails.send({
    from: RESEND_FROM,
    to: p.email,
    subject,
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0a0a0b;line-height:1.5;">
  <h2 style="font-family:Georgia,serif;font-size:24px;color:#0a0a0b;margin:0 0 8px;">Hola ${firstName || "de nuevo"},</h2>
  <p style="font-size:15px;color:#444;">${lead}</p>
  ${totalLine}
  ${extraBlock}
  <div style="margin:28px 0;">
    <a href="${pdfUrl}" style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;font-size:15px;">Ver propuesta ${p.proposalNumber} →</a>
  </div>
  <p style="color:#888;font-size:12px;">¿Prefieres no recibir más avisos sobre esta propuesta? Responde "BAJA".</p>
  <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
  <p style="color:#888;font-size:11px;margin:0;">
    STARTIDEA MALAGA SL · CIF B19583632 · Granada<br>
    Email automático · seguimiento de propuesta
  </p>
</div>`,
    text: `Hola ${firstName || ""},\n\n${lead}\n\nVer propuesta ${p.proposalNumber}: ${pdfUrl}\n\nSTARTIDEA MALAGA SL`,
  });
}
