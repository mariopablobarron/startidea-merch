/**
 * Aceptación pública de una propuesta por el cliente.
 *
 *   GET  /api/proposal/[number]/accept?token=<hmac>
 *        → NO muta. Renderiza una página de confirmación con el total y un
 *          botón «Confirmar aceptación» (POST). Así los prefetchers/escáneres
 *          de correo (que hacen GET) no aceptan por accidente.
 *
 *   POST /api/proposal/[number]/accept?token=<hmac>
 *        → Marca acceptedAt + status='accepted' (idempotente) y avisa al admin
 *          por Telegram. Renderiza página de éxito.
 *
 * Protegido por el mismo HMAC token (signProposalToken, exp. 30 días) que el PDF.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyProposalToken } from "@/lib/proposal-token";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});
const fmt = (cents: number) => EUR.format(cents / 100);

function htmlResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Shell HTML común, self-contained (email/landing sin CSS externo). */
function page(opts: { title: string; heading: string; bodyHtml: string }) {
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${opts.title} · TodoMerchandising</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f4;color:#0a0a0b;">
  <table cellpadding="0" cellspacing="0" width="100%" style="background:#faf8f4;padding:32px 16px;"><tr><td align="center">
    <table cellpadding="0" cellspacing="0" width="560" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e1d6;">
      <tr><td style="padding:28px 40px 12px 40px;border-bottom:1px solid #e6e1d6;">
        <h1 style="margin:0;font-size:20px;letter-spacing:-0.3px;">TodoMerchandising</h1>
      </td></tr>
      <tr><td style="padding:32px 40px 40px 40px;">
        <h2 style="margin:0 0 16px 0;font-size:22px;letter-spacing:-0.4px;">${opts.heading}</h2>
        ${opts.bodyHtml}
      </td></tr>
      <tr><td style="padding:20px 40px 28px 40px;">
        <p style="font-size:13px;line-height:1.5;color:#6b6b6b;margin:0;border-top:1px solid #e6e1d6;padding-top:16px;">
          <strong>Startidea Málaga SL</strong> · pedidos@startidea.es · +34 958 045 789
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

type LoadResult =
  | { ok: false; error: string; status: number }
  | { ok: true; proposal: NonNullable<Awaited<ReturnType<typeof prisma.proposal.findFirst>>> };

async function loadProposal(number: string, token: string | null): Promise<LoadResult> {
  if (!token) return { ok: false, status: 401, error: page({ title: "Enlace incompleto", heading: "Enlace incompleto", bodyHtml: "<p style='font-size:15px;line-height:1.6;'>Falta el código de seguridad del enlace. Abre la propuesta desde el enlace original del email.</p>" }) };
  const verified = verifyProposalToken(token);
  if (!verified.valid) {
    const expired = verified.reason === "expired";
    return {
      ok: false,
      status: 401,
      error: page({
        title: expired ? "Enlace caducado" : "Enlace no válido",
        heading: expired ? "Este enlace ha caducado" : "Enlace no válido",
        bodyHtml: `<p style="font-size:15px;line-height:1.6;">${expired ? "El enlace de la propuesta ha caducado (30 días)." : "El enlace no es válido."} Responde al email de tu propuesta y te enviamos uno nuevo.</p>`,
      }),
    };
  }
  const proposal = await prisma.proposal.findFirst({
    where: { id: verified.proposalId, proposalNumber: number },
  });
  if (!proposal) {
    return { ok: false, status: 404, error: page({ title: "No encontrada", heading: "Propuesta no encontrada", bodyHtml: "<p style='font-size:15px;line-height:1.6;'>No hemos encontrado esta propuesta.</p>" }) };
  }
  return { ok: true, proposal };
}

const totalBox = (proposal: { totalCents: number; subtotalCents: number; ivaCents: number }) => `
  <div style="background:#faf8f4;border-left:3px solid #c43c0d;padding:16px 20px;margin:20px 0;">
    <div style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Total (IVA incl.)</div>
    <div style="font-size:24px;font-weight:700;color:#c43c0d;">${fmt(proposal.totalCents)}</div>
    <div style="font-size:11px;color:#6b6b6b;margin-top:6px;">Subtotal sin IVA: ${fmt(proposal.subtotalCents)} · IVA 21%: ${fmt(proposal.ivaCents)}</div>
  </div>`;

const acceptedBody = (proposal: { proposalNumber: string; totalCents: number; subtotalCents: number; ivaCents: number }) => `
  <p style="font-size:15px;line-height:1.6;margin:0 0 8px 0;">Propuesta <strong>${proposal.proposalNumber}</strong> aceptada. ¡Gracias!</p>
  ${totalBox(proposal)}
  <p style="font-size:15px;line-height:1.6;margin:0;">Nuestro equipo se pondrá en contacto contigo para preparar el mockup técnico y la cotización vinculante. Si quieres adelantar algo, responde a <strong>pedidos@startidea.es</strong> indicando el número ${proposal.proposalNumber}.</p>`;

export async function GET(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const res = await loadProposal(number, token);
  if (!res.ok) return htmlResponse(res.error, res.status);
  const { proposal } = res;

  if (proposal.status === "accepted") {
    return htmlResponse(page({ title: "Propuesta aceptada", heading: "Ya has aceptado esta propuesta ✓", bodyHtml: acceptedBody(proposal) }));
  }

  const action = `/api/proposal/${encodeURIComponent(number)}/accept?token=${encodeURIComponent(token as string)}`;
  const body = `
    <p style="font-size:15px;line-height:1.6;margin:0 0 8px 0;">Estás a punto de aceptar la propuesta <strong>${proposal.proposalNumber}</strong>.</p>
    ${totalBox(proposal)}
    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px 0;">Es una aceptación orientativa: nos autorizas a preparar el <strong>mockup técnico</strong> y la <strong>cotización vinculante</strong>. No implica pago todavía.</p>
    <form method="POST" action="${action}" style="margin:0;">
      <button type="submit" style="display:inline-block;background:#0a0a0b;color:#fff;border:none;cursor:pointer;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:600;">✓ Confirmar aceptación</button>
    </form>`;
  return htmlResponse(page({ title: "Aceptar propuesta", heading: "Confirmar aceptación", bodyHtml: body }));
}

export async function POST(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const res = await loadProposal(number, token);
  if (!res.ok) return htmlResponse(res.error, res.status);
  const { proposal } = res;

  if (proposal.status !== "accepted") {
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    void notifyTelegram(
      `✅ <b>Propuesta ACEPTADA por el cliente</b> (${proposal.proposalNumber})\n` +
        `→ ${proposal.email}\nTotal: ${fmt(proposal.totalCents)}\n` +
        `Prepara mockup + cotización vinculante.`,
    ).catch((e) =>
      console.error("[proposal-accept] notifyTelegram falló:", e instanceof Error ? e.message : e),
    );
  }

  return htmlResponse(page({ title: "¡Gracias!", heading: "Propuesta aceptada ✓", bodyHtml: acceptedBody(proposal) }));
}
