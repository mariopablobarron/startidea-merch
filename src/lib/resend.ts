import { Resend } from "resend";
import { notifyTelegram } from "./telegram";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

export const RESEND_FROM = process.env.RESEND_FROM ?? "TodoMerchandising <pedidos@startidea.es>";
// Remitente de MARKETING (broadcasts + email frío) — SUBDOMINIO dedicado,
// separado del transaccional para proteger la reputación de los emails de
// cobro/pedidos. news.hubstartidea.es está verificado en Resend (DKIM+SPF+MX).
export const MARKETING_FROM =
  process.env.MARKETING_FROM ?? "TodoMerchandising <newsletter@news.hubstartidea.es>";
// Reply-to de marketing → buzón real monitorizado (el subdominio de envío solo
// tiene MX de rebotes, sin inbox). Coincide con SENDER.replyTo de outbound.
export const MARKETING_REPLY_TO = process.env.MARKETING_REPLY_TO ?? "pedidos@startidea.es";
export const RESEND_TO_INTERNAL = process.env.RESEND_TO_INTERNAL ?? "mariopablobarron@gmail.com";

export type SendEmailAttachment = {
  filename: string;
  content: Buffer;
};

export type SendEmailParams = {
  from?: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
  attachments?: SendEmailAttachment[];
  /**
   * Etiqueta para identificar el contexto en alertas Telegram cuando
   * falla. Ejemplos: "cart-quote · client confirmation", "stripe paid
   * webhook · internal", "broadcast · weekly newsletter".
   */
  context?: string;
  /** Cabeceras extra (ej. List-Unsubscribe para outbound/newsletter). */
  headers?: Record<string, string>;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; statusCode?: number };

/**
 * Envoltorio sobre `resend.emails.send` con alerta Telegram automática
 * cuando falla. Evita el silencio del bug 2026-05-16 (env quoting +
 * dominio no verificado dejaron emails sin enviar durante semanas).
 *
 * Si Resend no está configurado (`apiKey` ausente), devuelve error
 * silencioso sin alertar — útil en desarrollo local. En producción
 * la clave siempre está y el alert dispara.
 *
 * Uso típico:
 *   await sendEmail({
 *     to: client.email,
 *     subject: "...",
 *     html: render(...),
 *     context: "cart-quote · client confirmation",
 *   });
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!resend) {
    return { ok: false, error: "Resend no configurado (RESEND_API_KEY ausente)" };
  }
  try {
    const result = await resend.emails.send({
      from: params.from ?? RESEND_FROM,
      to: params.to,
      replyTo: params.replyTo,
      subject: params.subject,
      html: params.html,
      ...(params.attachments && params.attachments.length > 0
        ? { attachments: params.attachments }
        : {}),
      ...(params.headers ? { headers: params.headers } : {}),
    });
    // El SDK devuelve { data: { id }, error: null } o { data: null, error: {...} }
    if ("error" in result && result.error) {
      throw new Error(
        typeof result.error === "object" && result.error && "message" in result.error
          ? String((result.error as { message: unknown }).message)
          : JSON.stringify(result.error),
      );
    }
    const id =
      "data" in result && result.data && typeof result.data === "object" && "id" in result.data
        ? String((result.data as { id: unknown }).id)
        : "";
    return { ok: true, id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Alerta Telegram fire-and-forget — no bloqueamos el flujo de la app
    const toLabel = Array.isArray(params.to) ? params.to.join(", ") : params.to;
    void notifyTelegram(
      `⚠️ <b>Resend FALLÓ</b>\n` +
        (params.context ? `Contexto: ${params.context}\n` : "") +
        `To: ${toLabel}\n` +
        `Subject: ${params.subject.slice(0, 100)}\n` +
        `Error: ${message.slice(0, 300)}\n\n` +
        `Revisa /admin/cart-quotes o /admin/marketing/broadcasts si toca.`,
    ).catch(() => {});
    return { ok: false, error: message };
  }
}
