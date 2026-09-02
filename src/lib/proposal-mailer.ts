/**
 * Envío del email de propuesta al cliente con el PDF adjunto.
 *
 * Usa Resend directamente (no el wrapper sendEmail) porque necesitamos
 * pasar attachments, que el wrapper no soporta aún. Mantenemos la
 * alerta Telegram al fallar.
 */
import { resend, RESEND_FROM } from "./resend";
import {
  emailShell,
  emailHeader,
  emailPara,
  emailFinePrint,
  escapeHtml,
  EMAIL_COLORS,
} from "./email-templates";
import { notifyTelegram, escapeTgHtml } from "./telegram";
import type { ProposalTotals } from "./proposal-types";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const fmt = (cents: number) => EUR.format(cents / 100);

type SendProposalEmailParams = {
  proposalNumber: string;
  toEmail: string;
  name?: string | null;
  totals: ProposalTotals;
  downloadUrl: string;
  acceptUrl?: string;
  pdfBuffer: Buffer;
};

export type SendProposalEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendProposalEmail(
  params: SendProposalEmailParams,
): Promise<SendProposalEmailResult> {
  if (!resend) {
    return {
      ok: false,
      error: "Resend no configurado (RESEND_API_KEY ausente)",
    };
  }

  const subject = `Tu propuesta TodoMerchandising · ${params.proposalNumber} · ${fmt(params.totals.totalCents)}`;
  const greeting = params.name ? `Hola ${params.name},` : "Hola,";

  const html = emailShell(
    emailHeader(`Propuesta nº ${escapeHtml(params.proposalNumber)}`, escapeHtml(greeting)) +
      emailPara(
        "Adjunto encontrarás la propuesta orientativa que has solicitado a través de nuestro asistente. Total estimado:",
      ) +
      `<tr><td style="padding:20px 40px 0">
        <div style="background:${EMAIL_COLORS.bone};border-left:3px solid ${EMAIL_COLORS.accent};padding:16px 20px;border-radius:0 8px 8px 0">
          <div style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Total estimado (IVA incl.)</div>
          <div style="font-size:24px;font-weight:700;color:${EMAIL_COLORS.accent}">${fmt(params.totals.totalCents)}</div>
          <div style="font-size:11px;color:#6b6b6b;margin-top:6px">Subtotal sin IVA: ${fmt(params.totals.subtotalCents)} · IVA 21%: ${fmt(params.totals.ivaCents)}</div>
        </div>
      </td></tr>` +
      emailPara(
        "El PDF tiene el detalle por producto, cantidades y marcaje. Si prefieres descargarlo directamente:",
      ) +
      `<tr><td style="padding:24px 40px 0;text-align:center">
        <a href="${escapeHtml(params.downloadUrl)}" style="display:inline-block;background:${EMAIL_COLORS.ink};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:600">Descargar PDF</a>
      </td></tr>` +
      (params.acceptUrl
        ? `<tr><td style="padding:12px 40px 0;text-align:center">
        <a href="${escapeHtml(params.acceptUrl)}" style="display:inline-block;background:${EMAIL_COLORS.social};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:600">✓ Aceptar esta propuesta</a>
        <p style="font-size:12px;line-height:1.5;color:#6b6b6b;margin:8px 0 0">Aceptar no implica pago: nos autorizas a preparar el mockup y la cotización vinculante.</p>
      </td></tr>`
        : "") +
      emailPara(
        `Cuando quieras avanzar a una cotización vinculante con mockup técnico, respóndenos a este email indicando el número <strong>${escapeHtml(params.proposalNumber)}</strong> y arrancamos el proceso.`,
      ) +
      emailFinePrint("pedidos@startidea.es · +34 958 045 789"),
    `Total estimado ${fmt(params.totals.totalCents)} — PDF adjunto`,
  );

  try {
    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: params.toEmail,
      replyTo: "pedidos@startidea.es",
      subject,
      html,
      attachments: [
        {
          filename: `${params.proposalNumber}.pdf`,
          content: params.pdfBuffer,
        },
      ],
    });

    if ("error" in result && result.error) {
      throw new Error(
        typeof result.error === "object" && result.error && "message" in result.error
          ? String((result.error as { message: unknown }).message)
          : JSON.stringify(result.error),
      );
    }
    const id =
      "data" in result &&
      result.data &&
      typeof result.data === "object" &&
      "id" in result.data
        ? String((result.data as { id: unknown }).id)
        : "";
    return { ok: true, id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void notifyTelegram(
      `⚠️ <b>Resend FALLÓ — propuesta</b>\n` +
        `Propuesta: ${params.proposalNumber}\n` +
        `To: ${params.toEmail}\n` +
        `Total: ${fmt(params.totals.totalCents)}\n` +
        // `message` viene de Resend (o de JSON.stringify de su error): trae
        // comillas, `<` y `&` con normalidad. Sin escapar, el aviso de que la
        // propuesta NO salió por email tampoco llegaría por Telegram.
        `Error: ${escapeTgHtml(message.slice(0, 300))}`,
    ).catch(() => {});
    return { ok: false, error: message };
  }
}
