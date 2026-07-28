function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const COLORS = {
  ink: "#2A2A2A",
  bone: "#F4EFE6",
  boneSoft: "#FFFFFF",
  accent: "#E63E73",
  accentSoft: "#FBDFE9",
  divider: "#E8E2D5",
  social: "#4a9d7f",
} as const;

const BASE_STYLES = `
  font-family: Helvetica, Arial, sans-serif;
  background: ${COLORS.bone};
  color: ${COLORS.ink};
  line-height: 1.55;
  margin: 0;
  padding: 0;
`;

function wrap(content: string, preheader = "", opts?: { unsubscribeUrl?: string }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>todomerchandising</title>
</head>
<body style="${BASE_STYLES}">
${preheader ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bone};padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLORS.boneSoft};border-radius:16px;overflow:hidden">
      ${content}
      <tr><td style="background:${COLORS.ink};padding:20px 40px;color:rgba(244,239,230,0.7);font-size:11px;line-height:1.6">
        <p style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:16px">
          todo<span style="color:${COLORS.accent}">merchandising</span>
        </p>
        <p style="margin:6px 0 0">STARTIDEA MALAGA SL · CIF B19583632 · Granada · pedidos@startidea.es</p>
        ${opts?.unsubscribeUrl ? `<p style="margin:6px 0 0"><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:rgba(244,239,230,0.7);text-decoration:underline">Darme de baja</a></p>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export type QuoteEmailData = {
  id: string;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  productHint?: string | null;
  quantity?: number | null;
  deadline?: string | null;
  budget?: string | null;
  message: string;
  source?: string | null;
};

export function internalQuoteEmail(d: QuoteEmailData) {
  const rows = [
    ["Nombre", d.name],
    ["Empresa", d.company],
    ["Email", d.email],
    ["Teléfono", d.phone],
    ["Producto", d.productHint],
    ["Cantidad", d.quantity?.toString()],
    ["Plazo", d.deadline],
    ["Presupuesto", d.budget],
    ["Origen", d.source],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:10px 0;color:#0a0a0b80;font-size:13px;width:120px;vertical-align:top">${k}</td>
          <td style="padding:10px 0;font-size:14px;font-weight:500">${escapeHtml(String(v))}</td>
        </tr>`,
    )
    .join("");

  return wrap(
    `
      <tr><td style="padding:32px 40px 8px">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b">— Nueva cotización</p>
        <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:${COLORS.ink}">
          ${escapeHtml(d.name)}${d.company ? ` <span style="color:#a09e98;font-weight:400">· ${escapeHtml(d.company)}</span>` : ""}
        </h1>
      </td></tr>
      <tr><td style="padding:24px 40px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.divider}">${rows.replace(/#0a0a0b80/g, "#6b6b6b")}</table>
      </td></tr>
      <tr><td style="padding:0 40px 32px">
        <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b">Mensaje</p>
        <div style="padding:16px;background:${COLORS.bone};border-radius:12px;font-size:14px;line-height:1.6;white-space:pre-wrap;color:${COLORS.ink}">${escapeHtml(d.message)}</div>
        <p style="margin:24px 0 0;font-size:11px;color:#a09e98">ID: ${escapeHtml(d.id)}</p>
      </td></tr>
    `,
    `Cotización de ${d.name}${d.company ? " · " + d.company : ""}`,
  );
}

export function autoresponseQuoteEmail(d: QuoteEmailData) {
  const firstName = d.name.split(" ")[0];

  return wrap(
    `
      <tr><td style="padding:32px 40px 8px">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b">— Solicitud recibida</p>
        <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:${COLORS.ink}">
          Hola ${escapeHtml(firstName)}.<br>
          <span style="color:${COLORS.accent}">Tenemos tu brief.</span>
        </h1>
      </td></tr>
      <tr><td style="padding:16px 40px 0;font-size:15px;line-height:1.6;color:#444">
        <p style="margin:0">
          Recibimos tu solicitud y la estamos revisando. Te responderemos con
          <strong style="color:${COLORS.ink}">cotización cerrada en menos de 24 horas laborables</strong>:
          producto, marcaje, plazos y precio final. Sin sorpresas.
        </p>
        <p style="margin:16px 0 0">
          Si en este tiempo te surge algún detalle adicional —referencia visual, claim, color
          corporativo, plazo más específico— responde directamente a este email. Lo recibiremos.
        </p>
      </td></tr>
      <tr><td style="padding:24px 40px;text-align:center">
        <a href="https://merchandising.startidea.es" style="display:inline-block;background:${COLORS.accent};color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600">Visitar la web →</a>
      </td></tr>
      <tr><td style="padding:0 40px 32px">
        <div style="padding:20px;background:${COLORS.bone};border-radius:12px">
          <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b">Mientras tanto</p>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#444">
            Cada pedido tuyo genera trabajo digno en Centros Especiales de Empleo y talleres
            locales. Cuando entreguemos, te enviamos también un informe con
            <strong style="color:${COLORS.ink}">las horas de trabajo digno generadas</strong>
            y el % producido en CEE. Es la diferencia entre encargar merchandising y hacer
            que tu marca sume.
          </p>
        </div>
      </td></tr>
    `,
    `${firstName}, recibimos tu solicitud — respuesta en 24h`,
  );
}

// ── Primitivas reutilizables (la "idea react-email" sin la dependencia) ──────
// Cada helper devuelve filas <tr><td> listas para componer dentro de wrap(),
// siguiendo el patrón de internalQuoteEmail/autoresponseQuoteEmail. Objetivo:
// que NINGÚN sender vuelva a fabricar su propio shell/footer/botón a mano.

export { wrap as emailShell, escapeHtml };

/** Cabecera: kicker "— Sección" + titular Georgia. titleHtml YA escapado. */
export function emailHeader(kicker: string, titleHtml: string): string {
  return `
      <tr><td style="padding:32px 40px 8px">
        <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b">— ${escapeHtml(kicker)}</p>
        <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;color:${COLORS.ink}">${titleHtml}</h1>
      </td></tr>`;
}

/** Párrafo de cuerpo. innerHtml YA escapado (permite <strong> intencional). */
export function emailPara(innerHtml: string): string {
  return `
      <tr><td style="padding:16px 40px 0;font-size:15px;line-height:1.6;color:#444">
        <p style="margin:0">${innerHtml}</p>
      </td></tr>`;
}

/** CTA principal — botón píldora accent centrado. */
export function emailButton(href: string, label: string): string {
  return `
      <tr><td style="padding:28px 40px;text-align:center">
        <a href="${escapeHtml(href)}" style="display:inline-block;background:${COLORS.accent};color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:600">${escapeHtml(label)}</a>
      </td></tr>`;
}

/** Caja destacada sobre fondo bone (avisos, "mientras tanto", ayuda…). */
export function emailInfoBox(innerHtml: string): string {
  return `
      <tr><td style="padding:20px 40px 0">
        <div style="padding:16px 20px;background:${COLORS.bone};border-radius:12px;font-size:14px;line-height:1.6;color:#444">${innerHtml}</div>
      </td></tr>`;
}

/** Tabla de líneas (carrito/pedido): cantidad × nombre + importe opcional. */
export function emailItemsTable(
  items: Array<{ quantity: number; name: string; amountFormatted?: string | null }>,
  totalFormatted?: string | null,
): string {
  const rows = items
    .map(
      (it) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.divider};font-size:14px;color:${COLORS.ink}">${it.quantity}× ${escapeHtml(it.name)}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.divider};text-align:right;color:#6b6b6b;font-size:13px">${it.amountFormatted ? escapeHtml(it.amountFormatted) : ""}</td>
        </tr>`,
    )
    .join("");
  return `
      <tr><td style="padding:20px 40px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        ${totalFormatted ? `<p style="margin:14px 0 0;font-size:17px;color:${COLORS.ink}"><strong>Total estimado: ${escapeHtml(totalFormatted)}</strong></p>` : ""}
      </td></tr>`;
}

/** Nota final pequeña (baja, aviso de automatismo…). */
export function emailFinePrint(innerHtml: string): string {
  return `
      <tr><td style="padding:20px 40px 28px">
        <p style="margin:0;color:#a09e98;font-size:12px;line-height:1.5">${innerHtml}</p>
      </td></tr>`;
}

// ── Drip de carrito abandonado (24h / 72h / 7d) ──────────────────────────────
// Copy heredado 1:1 del cron; aquí solo cambia el shell (marca única, preheader,
// footer legal central) y que TODO lo que viene del usuario va escapado — el
// inline antiguo interpolaba cart.name sin escapar (inyección HTML).

export type CartDripEmailData = {
  step: 1 | 3 | 7;
  firstName: string | null;
  fallbackName: string;
  items: Array<{ quantity: number; name: string; amountFormatted?: string | null }>;
  totalFormatted?: string | null;
  discountedTotalFormatted?: string | null; // solo step 7
  recoverUrl: string;
};

export function abandonedCartDripEmail(d: CartDripEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const who = d.firstName || d.fallbackName;
  let subject: string;
  let lead: string;
  let kicker: string;
  let extraBlock = "";
  let ctaLabel = "Retomar mi cotización →";

  if (d.step === 1) {
    kicker = "Tu cotización";
    subject = `${d.firstName ? d.firstName + ", t" : "T"}u cotización en TodoMerchandising te espera`;
    lead = "Te dejaste algunos productos en tu cotización ayer y no queremos que se te pasen.";
  } else if (d.step === 3) {
    kicker = "Tu cotización";
    subject = `${d.firstName ? d.firstName + ", " : ""}¿quieres que te ayudemos a cerrar la cotización?`;
    lead =
      "Llevamos unos días con tu cotización a medias. Si tienes dudas con cantidades, técnica de marcaje o plazos, podemos llamarte y resolverlo en 10 min.";
    extraBlock = emailInfoBox(
      `💬 <strong>¿Necesitas ayuda?</strong> Responde a este email o escríbenos por WhatsApp y un asesor humano te marca en 1h laboral.`,
    );
  } else {
    kicker = "Última oportunidad";
    subject = `${d.firstName ? d.firstName + ", " : ""}última oportunidad — descuento por confirmar esta semana`;
    lead =
      "Esta es la última vez que te escribimos sobre tu cotización pendiente. Si quieres cerrarla, te aplicamos un -10% por las molestias de la espera.";
    extraBlock = `
      <tr><td style="padding:20px 40px 0">
        <div style="padding:18px;background:${COLORS.accent};color:#fff;border-radius:12px;text-align:center">
          <p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.85">Descuento exclusivo</p>
          <p style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:600">-10%</p>
          ${d.discountedTotalFormatted ? `<p style="margin:6px 0 0;font-size:15px;opacity:.9">Total con descuento: <strong>${escapeHtml(d.discountedTotalFormatted)}</strong></p>` : ""}
          <p style="margin:8px 0 0;font-size:11px;opacity:.85">Válido si confirmas esta semana. Aplica al pulsar el botón abajo.</p>
        </div>
      </td></tr>`;
    ctaLabel = "Quiero el -10% →";
  }

  const html = wrap(
    emailHeader(kicker, `Hola ${escapeHtml(who)},`) +
      emailPara(escapeHtml(lead)) +
      emailItemsTable(d.items, d.totalFormatted) +
      extraBlock +
      emailButton(d.recoverUrl, ctaLabel) +
      emailFinePrint(
        `¿Prefieres que dejemos de enviarte estos avisos? Responde "BAJA" a este email.<br>Email automático · drip ${d.step}`,
      ),
    lead,
  );

  const text = `Hola ${who},\n\n${lead}\n\nProductos:\n${d.items.map((it) => `- ${it.quantity}× ${it.name}`).join("\n")}\n\nRetomar: ${d.recoverUrl}\n\nSTARTIDEA MALAGA SL`;

  return { subject, html, text };
}

// Paleta del sistema de email, exportada para fragmentos custom de senders.
export const EMAIL_COLORS = COLORS;
