/**
 * HTML de los avisos internos que disparan las rutas públicas por token:
 * `/api/review/[token]` y `/api/proof/[token]/{approve,reject,revision}`.
 *
 * Por qué vive aquí y no en el route handler: un route handler de Next sólo
 * admite los exports que Next reconoce, así que el HTML que estaba inline no
 * se podía testear. Ése es justo el motivo por el que estas cuatro rutas se
 * escaparon del barrido de `54584b6` (miraba `src/lib`) y del guard de
 * `email-html-escape.guard.test.ts` (lista blanca de 5 ficheros).
 *
 * Qué controla quien rellena el formulario: en review, `authorName`,
 * `authorCompany` y `comment`; en proof, el `reason` del rechazo y la
 * `artworkUrl` de la revisión. Y `cart.name` / `cart.email` / `cart.company`
 * vienen del carrito, que también los escribió el cliente.
 *
 * No es XSS de navegador —los clientes de correo no ejecutan scripts— sino
 * markup inyectado en el buzón del equipo: sirve para suplantar un enlace y
 * hacer phishing dirigido a quien atiende los pedidos.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapa y convierte los saltos de línea en `<br>`, en ese orden. */
function escapeMultiline(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

/**
 * `artworkUrl` pasa un `z.string().url()`, y eso NO dice a dónde apunta:
 * `javascript:alert(1)` es una URL válida para el constructor `URL`, y está
 * comprobado contra producción que el schema lo acepta. El equipo hace clic
 * en este enlace para descargarse el arte del cliente, así que sólo se
 * convierte en enlace lo que sea `https://` o una ruta interna nuestra;
 * lo demás se enseña como texto plano escapado.
 *
 * Mismo criterio que `safeLogoHref` en `stripe-paid-emails.ts` (`ff60cfc`).
 */
export function safeArtworkHref(raw: string): string | null {
  if (raw.startsWith("/")) return `${SITE_URL}${raw}`;
  if (raw.startsWith("https://")) return raw;
  return null;
}

/** Enlace si el destino es seguro; si no, el texto escapado sin `href`. */
function linkOrPlainText(raw: string): string {
  const href = safeArtworkHref(raw);
  const texto = escapeHtml(raw);
  return href ? `<a href="${escapeHtml(href)}">${texto}</a>` : `${texto} <em>(enlace no seguro, no se enlaza)</em>`;
}

export type ReviewEmailInput = {
  npsScore: number;
  /** `Review.authorName` es opcional en BD: sin esto el asunto decía «null». */
  authorName: string | null;
  authorCompany?: string | null;
  comment?: string | null;
  isPublic: boolean;
  cartId: string;
};

/** Etiqueta de quien firma la review; `Review.authorName` puede venir vacío. */
function quienFirma(authorName: string | null): string {
  return authorName?.trim() || "Sin nombre";
}

export function reviewInternalEmailSubject(input: ReviewEmailInput): string {
  return `[Review NPS ${input.npsScore}/10] ${quienFirma(input.authorName)}`;
}

export function reviewInternalEmailHtml(input: ReviewEmailInput): string {
  const { npsScore, authorName, authorCompany, comment, isPublic, cartId } = input;
  return `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#0a0a0b;">
          <h3 style="margin-top:0;">Nueva review · NPS ${npsScore}/10</h3>
          <p><strong>${escapeHtml(quienFirma(authorName))}</strong>${authorCompany ? ` · ${escapeHtml(authorCompany)}` : ""}</p>
          ${comment ? `<blockquote style="border-left:3px solid #ff6b35;padding-left:12px;color:#444;">${escapeMultiline(comment)}</blockquote>` : "<p style='color:#888'><em>Sin comentario</em></p>"}
          <p style="font-size:12px;color:#888;">Pública: ${isPublic ? "sí" : "no"} · Cart ID <code>${escapeHtml(cartId)}</code></p>
        </div>`;
}

export type ProofCustomer = {
  name: string;
  email: string;
  company?: string | null;
};

/** Sufijo « · Empresa» del asunto. El asunto es texto, no HTML: no se escapa. */
function subjectSuffix(customer: ProofCustomer): string {
  return customer.company ? " · " + customer.company : "";
}

export function proofApprovedEmailSubject(customer: ProofCustomer): string {
  return `[Proof aprobado] ${customer.name}${subjectSuffix(customer)}`;
}

export function proofApprovedEmailHtml(customer: ProofCustomer, proofId: string): string {
  return `<p>El cliente <strong>${escapeHtml(customer.name)}</strong> (${escapeHtml(customer.email)}) ha aprobado el proof.</p><p>Proof ID: <code>${escapeHtml(proofId)}</code></p>`;
}

export function proofRejectedEmailSubject(customer: ProofCustomer): string {
  return `[Proof rechazado] ${customer.name}${subjectSuffix(customer)}`;
}

export function proofRejectedEmailHtml(customer: ProofCustomer, proofId: string, reason: string): string {
  return `<p>El cliente <strong>${escapeHtml(customer.name)}</strong> (${escapeHtml(customer.email)}) ha rechazado el proof.</p><p>Motivo:</p><blockquote>${escapeMultiline(reason)}</blockquote><p>Proof ID: <code>${escapeHtml(proofId)}</code></p>`;
}

export function proofRevisionEmailSubject(customer: ProofCustomer): string {
  return `[Proof artwork nuevo] ${customer.name}${subjectSuffix(customer)}`;
}

export function proofRevisionEmailHtml(customer: ProofCustomer, proofId: string, artworkUrl: string): string {
  return `<p>El cliente <strong>${escapeHtml(customer.name)}</strong> ha subido artwork nuevo.</p><p>URL: ${linkOrPlainText(artworkUrl)}</p><p>Proof ID: <code>${escapeHtml(proofId)}</code></p>`;
}
