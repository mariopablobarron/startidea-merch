function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const COLORS = {
  ink: "#0B0B0F",
  bone: "#F5F1EA",
  boneSoft: "#FAF7F2",
  accent: "#FF5A1F",
  social: "#10B981",
} as const;

const BASE_STYLES = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
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
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLORS.boneSoft};border:1px solid #0B0B0F0d;border-radius:24px;overflow:hidden">
      <tr><td style="padding:32px 40px 0">
        <p style="margin:0;font-size:16px;font-weight:600;letter-spacing:-0.01em">
          todo<span style="color:${COLORS.accent}">merchandising</span>
        </p>
      </td></tr>
      ${content}
      <tr><td style="padding:24px 40px 32px;border-top:1px solid #0B0B0F0d;font-size:12px;color:#0B0B0F80">
        Una iniciativa de Startidea · merchandising.startidea.es
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
          <td style="padding:10px 0;color:#0B0B0F80;font-size:13px;width:120px;vertical-align:top">${k}</td>
          <td style="padding:10px 0;font-size:14px;font-weight:500">${escapeHtml(String(v))}</td>
        </tr>`,
    )
    .join("");

  return wrap(
    `
      <tr><td style="padding:24px 40px 8px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.accent}">Nueva cotización</p>
        <h1 style="margin:0;font-size:28px;line-height:1.15;letter-spacing:-0.02em;font-weight:700">${escapeHtml(d.name)}${d.company ? ` <span style="color:#0B0B0F50;font-weight:500">· ${escapeHtml(d.company)}</span>` : ""}</h1>
      </td></tr>
      <tr><td style="padding:0 40px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #0B0B0F12">${rows}</table>
      </td></tr>
      <tr><td style="padding:0 40px 32px">
        <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0B0B0F80">Mensaje</p>
        <div style="padding:16px;background:${COLORS.bone};border-radius:12px;font-size:14px;white-space:pre-wrap">${escapeHtml(d.message)}</div>
        <p style="margin:24px 0 0;font-size:11px;color:#0B0B0F50">ID: ${escapeHtml(d.id)}</p>
      </td></tr>
    `,
    `Cotización de ${d.name}${d.company ? " · " + d.company : ""}`,
  );
}

export function autoresponseQuoteEmail(d: QuoteEmailData) {
  const firstName = d.name.split(" ")[0];

  return wrap(
    `
      <tr><td style="padding:24px 40px 8px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.accent}">Solicitud recibida</p>
        <h1 style="margin:0;font-size:30px;line-height:1.1;letter-spacing:-0.02em;font-weight:700">
          Hola ${escapeHtml(firstName)},<br>tenemos tu brief.
        </h1>
      </td></tr>
      <tr><td style="padding:8px 40px 0;font-size:16px;color:#0B0B0FB3">
        <p style="margin:24px 0 0">
          Recibimos tu solicitud y la estamos revisando. Te responderemos con
          <strong style="color:${COLORS.ink}">cotización cerrada en menos de 24 horas laborables</strong>:
          producto, marcaje, plazos y precio final. Sin sorpresas.
        </p>
        <p style="margin:24px 0 0">
          Si en este tiempo te surge algún detalle adicional —referencia visual, claim, color
          corporativo, plazo más específico— responde directamente a este email. Lo recibiremos.
        </p>
      </td></tr>
      <tr><td style="padding:32px 40px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:${COLORS.ink};border-radius:9999px">
              <a href="https://merchandising.startidea.es" style="display:inline-block;padding:14px 28px;color:${COLORS.bone};text-decoration:none;font-weight:500;font-size:14px">Visitar la web</a>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 40px 16px">
        <div style="padding:20px;background:${COLORS.bone};border-radius:16px;border:1px solid #0B0B0F0d">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#0B0B0F80">Mientras tanto</p>
          <p style="margin:12px 0 0;font-size:14px;color:#0B0B0FB3">
            Cada pedido tuyo genera trabajo digno en Centros Especiales de Empleo y talleres
            locales. Cuando entreguemos, te enviamos también un informe con
            <strong style="color:${COLORS.social}">las horas de trabajo digno generadas</strong>
            y el % producido en CEE. Es la diferencia entre encargar merchandising y hacer
            que tu marca sume.
          </p>
        </div>
      </td></tr>
    `,
    `${firstName}, recibimos tu solicitud — respuesta en 24h`,
  );
}
