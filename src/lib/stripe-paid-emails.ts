import { escapeHtml } from "@/lib/email-templates";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";

/**
 * Los dos emails que salen cuando Stripe confirma un pago: el interno al equipo
 * y el de confirmación al cliente.
 *
 * Viven aquí y no dentro del route handler por dos razones:
 *  1. Next sólo admite en un `route.ts` los exports que reconoce, así que ahí
 *     dentro no se podían probar.
 *  2. Todo lo que interpolan viene de `CartQuote` / `CartQuoteItem`, y esas
 *     tablas las rellena la ruta PÚBLICA `/api/cart-quote` — quien monta el
 *     carrito escribe `name`, `company`, `productName`, `productRef`, el
 *     nombre del logo y los datos de marcaje. Iban crudos al HTML del buzón
 *     interno: no es XSS de navegador (los clientes de correo no ejecutan
 *     scripts), es markup inyectado en el correo que abre quien atiende los
 *     pedidos, útil para suplantar un enlace. Se escapa TODO lo que no
 *     generamos nosotros.
 *
 * Medido en producción (20-ago-2026): 11 `CartQuote` y 16 `CartQuoteItem`;
 * ninguno con `<`, `>` o `&` en nombre o empresa, y uno con comillas dobles
 * legítimas (`CAMISETA ADULTO "RUNNER"`). Escapar no cambia nada de lo que hay
 * — el cliente de correo pinta `&quot;` como `"` — pero ese caso demuestra que
 * los datos reales YA traen caracteres de HTML.
 */
/**
 * El `customerLogoUrl` llega en el cuerpo público de `/api/cart-quote`: el
 * schema lo acota a 500 caracteres, pero no dice a dónde apunta. Se admite
 * sólo la ruta interna del fichero subido (lo que hay en producción: los 2
 * logos reales empiezan por `/files/customer-logos/`) o una URL https.
 * Cualquier otra cosa — `javascript:`, `data:`, http en claro — no se
 * convierte en enlace: el equipo hace clic en esto para descargar el logo.
 */
export function safeLogoHref(raw: string): string | null {
  if (raw.startsWith("/")) return `${SITE_URL}${raw}`;
  if (raw.startsWith("https://")) return raw;
  return null;
}

export function internalPaymentEmailHtml(args: {
  customer: { name: string; email: string; company: string | null };
  amountFmt: string;
  cartId: string;
  viaLabel: string;
  receiptUrl?: string;
  items: Array<{
    productName: string;
    productRef: string;
    quantity: number;
    customerLogoUrl: string | null;
    customerLogoFilename: string | null;
    markingTechniqueName: string | null;
    markingPositionId: string | null;
    markingColours: number | null;
  }>;
}): string {
  const { customer, amountFmt, cartId, viaLabel, receiptUrl, items } = args;
  const adminUrl = `${SITE_URL}/admin/cart-quotes/${cartId}`;

  const logosBlock = items
    .filter((it) => it.customerLogoUrl)
    .map((it) => {
      const href = safeLogoHref(it.customerLogoUrl!);
      const marking = it.markingTechniqueName
        ? ` · ${escapeHtml(it.markingTechniqueName)} en ${escapeHtml(it.markingPositionId ?? "")}${it.markingColours && it.markingColours > 1 ? ` (${it.markingColours} col.)` : ""}`
        : "";
      const label = escapeHtml(it.customerLogoFilename || "Logo cliente");
      // Sin href seguro se pinta el nombre del fichero sin enlace: mejor un
      // dato menos que un enlace que no lleva a donde dice.
      const link = href
        ? `<a href="${escapeHtml(href)}" style="color:#E63E73;">📥 ${label}</a>`
        : `📥 ${label} <span style="color:#888;">(ruta no reconocida, ábrelo desde el admin)</span>`;
      return `<li style="margin:8px 0;">
        <strong>${escapeHtml(it.productName)}</strong> (${escapeHtml(it.productRef)}) × ${it.quantity}${marking}<br>
        ${link}
      </li>`;
    })
    .join("");

  return `<div style="font-family:-apple-system,sans-serif;max-width:680px;color:#2A2A2A;">
    <h2 style="font-family:Georgia,serif;">Pago recibido vía Stripe${viaLabel}</h2>
    <p><strong>Cliente:</strong> ${escapeHtml(customer.name)} (${escapeHtml(customer.email)})${customer.company ? `<br><strong>Empresa:</strong> ${escapeHtml(customer.company)}` : ""}</p>
    <p><strong>Importe:</strong> ${amountFmt} €</p>
    <p><strong>Cart ID:</strong> <code>${escapeHtml(cartId)}</code></p>

    ${logosBlock
      ? `<h3 style="font-family:Georgia,serif;margin-top:24px;">Logos a descargar para MidOcean</h3>
         <ul style="padding-left:20px;">${logosBlock}</ul>`
      : '<p style="color:#888;font-size:13px;">Sin logos personalizados subidos.</p>'}

    <p style="margin-top:24px;">
      <a href="${adminUrl}" style="background:#E63E73;color:white;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Abrir cart en admin →</a>
    </p>

    <p style="color:#888;font-size:12px;margin-top:16px;">
      Auto-flow MidOcean: revisa Telegram para resultado (placed/dryRun/error).
      ${receiptUrl ? `<br><a href="${escapeHtml(receiptUrl)}">Ver recibo Stripe</a>` : ""}
    </p>
  </div>`;
}

export function clientPaidEmailHtml(args: {
  firstName: string;
  amountFmt: string;
  cartId: string;
  portalLink: string | null;
  receiptUrl?: string;
}): string {
  const { firstName, amountFmt, cartId, portalLink, receiptUrl } = args;
  return `
    <div style="font-family:Helvetica,Arial,sans-serif;background:#F4EFE6;padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;color:#2A2A2A;">

        <!-- Header con check verde grande -->
        <div style="padding:40px 32px 24px;text-align:center;">
          <div style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:50%;background:#4a9d7f;color:#FFFFFF;font-size:32px;font-weight:bold;margin-bottom:20px;">✓</div>
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Pago confirmado</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;color:#2A2A2A;">
            Gracias ${escapeHtml(firstName)}.<br>
            <span style="color:#E63E73;">Pasamos a producción.</span>
          </h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#444;">
            Hemos recibido tu pago de <strong>${amountFmt} €</strong>. Tu pedido entra
            en cola de producción ahora mismo.
          </p>
        </div>

        ${portalLink ? `
        <!-- CTA portal cliente -->
        <div style="padding:0 32px 8px;text-align:center;">
          <a href="${escapeHtml(portalLink)}" style="display:inline-block;background:#E63E73;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600;">Ver estado de mi pedido →</a>
          <p style="margin:12px 0 0;font-size:11px;color:#a09e98;line-height:1.5;">
            Acceso a tu portal: tracking, factura, mockups y proofs.<br>
            Enlace válido 7 días — después solicita uno nuevo en
            <a href="${SITE_URL}/clientes/login" style="color:#6b6b6b;">${SITE_URL.replace("https://", "")}/clientes/login</a>
          </p>
        </div>
        ` : ""}

        <!-- Qué pasa ahora -->
        <div style="margin:32px;padding:24px;background:#F4EFE6;border-radius:12px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">— Qué pasa ahora</p>
          <ol style="margin:12px 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:#2A2A2A;">
            <li><strong>Mockup de aprobación</strong> (si lleva personalización) — te lo enviamos para revisión antes de imprimir nada.</li>
            <li><strong>Producción</strong> — fabricamos en Centros Especiales de Empleo y talleres certificados.</li>
            <li><strong>Envío</strong> — recibirás email con tracking del transportista en cuanto salga.</li>
            <li><strong>Entrega</strong> — 7-15 días laborables salvo urgencia coordinada.</li>
          </ol>
        </div>

        <!-- Recibo Stripe + ID corto -->
        <div style="padding:0 32px 24px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#6b6b6b;">
            Referencia de tu pedido:
            <code style="background:#F4EFE6;padding:2px 8px;border-radius:4px;color:#2A2A2A;font-weight:600;">${escapeHtml(cartId.slice(0, 8).toUpperCase())}</code>
          </p>
          ${receiptUrl ? `
          <p style="margin:12px 0 0;font-size:13px;">
            <a href="${escapeHtml(receiptUrl)}" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">Descargar recibo Stripe →</a>
          </p>
          ` : ""}
        </div>

        <!-- Contacto rápido -->
        <div style="padding:0 32px 24px;text-align:center;border-top:1px solid #E8E2D5;padding-top:24px;">
          <p style="margin:0;font-size:13px;color:#444;">
            ¿Algo no encaja? Estamos a un email:
          </p>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.8;">
            <a href="https://wa.me/34958045789" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">WhatsApp +34 958 045 789</a><br>
            <a href="mailto:pedidos@startidea.es" style="color:#2A2A2A;text-decoration:none;border-bottom:1px solid #E63E73;padding-bottom:1px;">pedidos@startidea.es</a>
          </p>
        </div>

        <!-- Footer brand -->
        <div style="background:#2A2A2A;padding:24px 32px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6;">
          <p style="margin:0;color:#FFFFFF;font-family:Georgia,serif;font-size:16px;">
            todo<span style="color:#E63E73;">merchandising</span>
          </p>
          <p style="margin:8px 0 0;">
            Una iniciativa de Startidea · Agencia de Innovación Social<br>
            STARTIDEA MALAGA SL · CIF B19583632 · C/ Conde Cifuentes, 33 — 18005 Granada
          </p>
        </div>
      </div>
    </div>`;
}
