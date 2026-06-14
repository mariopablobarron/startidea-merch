import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_OUTBOUND || process.env.OPENROUTER_MODEL_COPY || "anthropic/claude-sonnet-4.5";

// Identidad del remitente — obligatoria por LSSI-CE art. 20.
const SENDER = {
  legal: "STARTIDEA MALAGA SL",
  cif: "B19583632",
  address: "C/ Conde Cifuentes, 33 — 18005 Granada",
  brand: "TodoMerchandising",
  replyTo: "pedidos@startidea.es",
};

export type ColdEmailDraft = { subject: string; body: string };

/**
 * ¿Está el email en la lista de supresión? (opt-out previo, bounce, queja).
 * Se consulta SIEMPRE antes de enviar.
 */
export async function isSuppressed(email: string): Promise<boolean> {
  const hit = await prisma.outboundSuppression.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true },
  });
  return Boolean(hit);
}

/** Añade un email a la lista de supresión (idempotente). */
export async function suppressEmail(email: string, reason: string): Promise<void> {
  const e = email.toLowerCase().trim();
  await prisma.outboundSuppression
    .upsert({ where: { email: e }, create: { email: e, reason }, update: {} })
    .catch(() => {});
}

/** Garantiza que el lead tiene un unsubToken; lo crea si falta. */
async function ensureUnsubToken(leadId: string, current: string | null): Promise<string> {
  if (current) return current;
  const token = `ub_${randomBytes(18).toString("base64url")}`;
  await prisma.outboundLead.update({ where: { id: leadId }, data: { unsubToken: token } });
  return token;
}

/**
 * Genera con IA un email frío B2B personalizado para el lead. Devuelve
 * {subject, body} en texto plano (2-3 párrafos breves). El pie legal NO lo
 * genera la IA — se añade después en sendColdEmail.
 */
export async function generateColdEmail(lead: {
  name: string;
  company: string | null;
  role: string | null;
  segment: string | null;
}): Promise<{ ok: true; draft: ColdEmailDraft } | { ok: false; error: string }> {
  if (!OPENROUTER_API_KEY) return { ok: false, error: "OPENROUTER_API_KEY no configurado" };

  const system = `Eres un SDR B2B de ${SENDER.brand} (marca de Startidea, agencia de innovación social de Granada). Vendéis merchandising personalizado (textil, banderas, regalos de empresa) producido en Centros Especiales de Empleo y talleres certificados, con impacto social real. Diferenciales: precio competitivo, cotización al instante online, y cada pedido genera empleo para personas con discapacidad en Granada.

Escribe emails de PRIMER CONTACTO B2B en español: humanos, directos, BREVES (máx 90 palabras de cuerpo), sin jerga comercial, sin exagerar, sin emojis. Tono respetuoso de tú. Una sola llamada a la acción suave (responder a este email o ver el catálogo). NO inventes datos del destinatario que no te den. NO prometas precios concretos. Devuelve JSON {"subject": "...", "body": "..."} con subject de máx 60 caracteres (sin "RE:" ni clickbait) y body en texto plano con saltos de línea \\n entre párrafos.`;

  const user = `Lead:
- Nombre: ${lead.name}
- Empresa: ${lead.company || "(desconocida)"}
- Cargo: ${lead.role || "(desconocido)"}
- Sector/segmento: ${lead.segment || "(desconocido)"}

Escribe el email de primer contacto. Personalízalo con lo que sepas (empresa, sector), pero si no hay datos, mantenlo genérico y honesto. Recuerda: máx 90 palabras de cuerpo, una CTA suave.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": SITE_URL,
        "X-Title": "TodoMerchandising Outbound",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `OpenRouter HTTP ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Respuesta IA vacía" };
    let parsed: { subject?: string; body?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      parsed = m ? JSON.parse(m[1]) : {};
    }
    const subject = String(parsed.subject || "").trim().slice(0, 80);
    const body = String(parsed.body || "").trim();
    if (!subject || !body) return { ok: false, error: "IA no devolvió subject/body válidos" };
    return { ok: true, draft: { subject, body } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pie legal LSSI/RGPD obligatorio en cada email frío B2B. */
function complianceFooterHtml(unsubUrl: string): string {
  return `
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:11px;line-height:1.6;color:#888;font-family:Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 6px;">Te escribimos por interés legítimo como empresa (B2B), porque ${SENDER.brand} puede encajar con tu organización. Si prefieres no recibir más comunicaciones nuestras, dínoslo y no volveremos a escribirte:
        <a href="${unsubUrl}" style="color:#888;">darme de baja</a>.</p>
      <p style="margin:0;">${SENDER.legal} · CIF ${SENDER.cif} · ${SENDER.address} · ${SENDER.replyTo}</p>
    </div>`;
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export type SendColdEmailResult =
  | { ok: true; preview: true; draft: ColdEmailDraft; unsubUrl: string }
  | { ok: true; preview: false; draft: ColdEmailDraft; messageId: string | null }
  | { ok: false; error: string; code: "NO_EMAIL" | "SUPPRESSED" | "GEN_FAILED" | "SEND_FAILED" | "NOT_FOUND" };

/**
 * Genera (IA) y, salvo preview, ENVÍA un email frío B2B compliant a un lead.
 * Guardas: lead existe + tiene email + no está suprimido. Añade pie legal
 * LSSI + link de baja funcional. Actualiza tracking del lead (no en preview).
 */
export async function sendColdEmail(
  leadId: string,
  opts: { preview?: boolean; draft?: ColdEmailDraft } = {},
): Promise<SendColdEmailResult> {
  const lead = await prisma.outboundLead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead no encontrado", code: "NOT_FOUND" };
  if (!lead.email) return { ok: false, error: "El lead no tiene email", code: "NO_EMAIL" };
  if (await isSuppressed(lead.email)) {
    return { ok: false, error: "Email en lista de supresión (opt-out)", code: "SUPPRESSED" };
  }

  // Draft: el que venga (revisado por admin) o generado con IA.
  let draft = opts.draft;
  if (!draft) {
    const gen = await generateColdEmail(lead);
    if (!gen.ok) return { ok: false, error: gen.error, code: "GEN_FAILED" };
    draft = gen.draft;
  }

  const token = await ensureUnsubToken(lead.id, lead.unsubToken);
  const unsubUrl = `${SITE_URL}/api/outbound/unsubscribe?token=${encodeURIComponent(token)}`;

  if (opts.preview) {
    return { ok: true, preview: true, draft, unsubUrl };
  }

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;">
      ${bodyToHtml(draft.body)}
      ${complianceFooterHtml(unsubUrl)}
    </div>`;

  const sent = await sendEmail({
    to: lead.email,
    replyTo: SENDER.replyTo,
    subject: draft.subject,
    html,
    context: `outbound cold-email · lead ${lead.id}`,
    // List-Unsubscribe: baja en 1 clic desde el cliente de correo (RFC 8058).
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (!sent.ok) return { ok: false, error: sent.error || "Fallo al enviar", code: "SEND_FAILED" };

  await prisma.outboundLead.update({
    where: { id: lead.id },
    data: {
      lastEmailedAt: new Date(),
      lastContactAt: new Date(),
      emailsSent: { increment: 1 },
      status: lead.status === "NEW" ? "MESSAGED" : lead.status,
    },
  });

  return { ok: true, preview: false, draft, messageId: sent.id ?? null };
}
