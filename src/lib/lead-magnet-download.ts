/**
 * Validación y plantilla de email de POST /api/lead-magnets/[slug]/download.
 *
 * Vive fuera de `route.ts` porque Next sólo admite en un route handler los
 * exports que reconoce (métodos HTTP y config), y esto necesita ser importable
 * para poder probarlo. Mismo patrón que `newsletter-subscribe-schema.ts`.
 *
 * La ruta es PÚBLICA y sin auth, y hace tres cosas con lo que le manden:
 * escribe dos filas (`LeadDownload` + `NewsletterSubscriber`), dispara un email
 * real de Resend **a la dirección que le den** y avisa al Telegram del equipo.
 * Es la misma familia que `/api/newsletter/subscribe` (arreglada en `abf9f95`)
 * y con un daño mayor: además del correo con nuestro dominio a un tercero que
 * no lo pidió, mete ruido en el canal por el que el equipo ve los leads de
 * verdad.
 *
 * Y el nombre que escribe el visitante se pintaba **crudo** dentro del HTML del
 * correo. Como quien rellena el formulario puede poner el email de OTRA
 * persona, eso no es self-XSS: es un correo con la marca de TodoMerchandising
 * y el markup de quien lo envía, aterrizando en el buzón de la víctima. Mismo
 * razonamiento que cerró `54584b6` para los 9 sitios de email de entonces.
 */
import { z } from "zod";

/** Tope de email, en caracteres. El mismo de `newsletter-subscribe-schema`. */
export const MAX_EMAIL_CHARS = 160;

export const LeadMagnetDownloadSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_CHARS).transform((s) => s.toLowerCase()),
  name: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  utm: z
    .object({
      source: z.string().max(60).optional(),
      medium: z.string().max(60).optional(),
      campaign: z.string().max(120).optional(),
    })
    .optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Acepta política de privacidad" }) }),
});

export type LeadMagnetDownload = z.infer<typeof LeadMagnetDownloadSchema>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Saludo por nombre de pila; vacío si no dio nombre. */
function firstName(name?: string): string {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  return first;
}

export type LeadMagnetEmailInput = {
  name?: string;
  magnetTitle: string;
  /** URL del PDF. La fija el admin en `LeadMagnet`, no el visitante. */
  fileUrl: string;
  siteUrl: string;
};

/** HTML del email de descarga. Todo lo que viene del visitante va escapado. */
export function buildLeadMagnetEmailHtml(input: LeadMagnetEmailInput): string {
  const first = firstName(input.name);
  const saludo = first ? ` ${escapeHtml(first)}` : "";
  return `
<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#231F27;">
  <h2 style="font-family:Georgia,serif;color:#231F27;">Aquí tienes tu descarga</h2>
  <p>Hola${saludo},</p>
  <p>Gracias por descargar <strong>${escapeHtml(input.magnetTitle)}</strong>. Aquí tienes el archivo:</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(input.fileUrl)}" style="display:inline-block;background:#C41D51;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Descargar PDF →</a>
  </p>
  <p style="color:#666;font-size:14px;">¿Te gustó? Entra al catálogo cuando quieras — verás precio al instante en cada producto.</p>
  <p style="margin:20px 0;">
    <a href="${input.siteUrl}/catalogo" style="color:#C41D51;">Ver catálogo</a> ·
    <a href="${input.siteUrl}/#cotizar" style="color:#C41D51;">Pedir cotización</a>
  </p>
  <hr style="border:none;border-top:1px solid #E7E2E6;margin:32px 0;">
  <p style="color:#888;font-size:11px;">STARTIDEA MALAGA SL · CIF B19583632 · Granada</p>
</div>`;
}

/** Versión de texto plano. No hay markup que escapar aquí. */
export function buildLeadMagnetEmailText(input: LeadMagnetEmailInput): string {
  const first = firstName(input.name);
  return `Hola${first ? ` ${first}` : ""},\n\nDescarga: ${input.fileUrl}\n\nGracias por tu interés en TodoMerchandising.`;
}
