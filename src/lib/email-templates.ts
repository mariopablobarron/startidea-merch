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

function wrap(content: string, preheader = "") {
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
