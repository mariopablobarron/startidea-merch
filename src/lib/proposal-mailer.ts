/**
 * Envío del email de propuesta al cliente con el PDF adjunto.
 *
 * Usa Resend directamente (no el wrapper sendEmail) porque necesitamos
 * pasar attachments, que el wrapper no soporta aún. Mantenemos la
 * alerta Telegram al fallar.
 */
import { resend, RESEND_FROM } from "./resend";
import { notifyTelegram } from "./telegram";
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

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f4;color:#0a0a0b;">
  <table cellpadding="0" cellspacing="0" width="100%" style="background:#faf8f4;padding:24px 0;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e6e1d6;">

        <tr><td style="padding:32px 40px 8px 40px;border-bottom:1px solid #e6e1d6;">
          <h1 style="margin:0;font-size:20px;letter-spacing:-0.3px;">TodoMerchandising</h1>
          <p style="margin:4px 0 0 0;font-size:12px;color:#6b6b6b;letter-spacing:0.5px;text-transform:uppercase;">Propuesta nº ${params.proposalNumber}</p>
        </td></tr>

        <tr><td style="padding:28px 40px 0 40px;">
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">${greeting}</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">
            Adjunto encontrarás la propuesta orientativa que has solicitado a través
            de nuestro asistente. Total estimado:
          </p>

          <div style="background:#faf8f4;border-left:3px solid #c43c0d;padding:16px 20px;margin:20px 0;">
            <div style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Total estimado (IVA incl.)</div>
            <div style="font-size:24px;font-weight:700;color:#c43c0d;">${fmt(params.totals.totalCents)}</div>
            <div style="font-size:11px;color:#6b6b6b;margin-top:6px;">
              Subtotal sin IVA: ${fmt(params.totals.subtotalCents)} · IVA 21%: ${fmt(params.totals.ivaCents)}
            </div>
          </div>

          <p style="font-size:15px;line-height:1.6;margin:0 0 16px 0;">
            El PDF tiene el detalle por producto, cantidades y marcaje. Si prefieres
            descargarlo directamente:
          </p>

          <p style="margin:24px 0 12px 0;text-align:center;">
            <a href="${params.downloadUrl}" style="display:inline-block;background:#0a0a0b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:600;">Descargar PDF</a>
          </p>
          ${
            params.acceptUrl
              ? `<p style="margin:0 0 8px 0;text-align:center;">
            <a href="${params.acceptUrl}" style="display:inline-block;background:#0f9d58;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:600;">✓ Aceptar esta propuesta</a>
          </p>
          <p style="font-size:12px;line-height:1.5;color:#6b6b6b;margin:0;text-align:center;">Aceptar no implica pago: nos autorizas a preparar el mockup y la cotización vinculante.</p>`
              : ""
          }

          <p style="font-size:14px;line-height:1.6;color:#444;margin:24px 0 0 0;">
            Cuando quieras avanzar a una cotización vinculante con mockup técnico,
            respóndenos a este email indicando el número <strong>${params.proposalNumber}</strong>
            y arrancamos el proceso.
          </p>
        </td></tr>

        <tr><td style="padding:24px 40px 32px 40px;">
          <p style="font-size:13px;line-height:1.5;color:#6b6b6b;margin:24px 0 0 0;border-top:1px solid #e6e1d6;padding-top:16px;">
            <strong>Startidea Málaga SL</strong><br>
            pedidos@startidea.es · +34 958 045 789<br>
            Málaga, España
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
        `Error: ${message.slice(0, 300)}`,
    ).catch(() => {});
    return { ok: false, error: message };
  }
}
