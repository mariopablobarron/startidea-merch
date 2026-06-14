/**
 * WhatsApp Business Cloud API (Meta) — envío de plantillas.
 *
 * DURMIENTE hasta configurar el sender: si faltan WHATSAPP_TOKEN o
 * WHATSAPP_PHONE_NUMBER_ID, todas las llamadas hacen no-op (skipped:true), así
 * que es seguro tenerlo cableado antes de tener las credenciales de Meta.
 *
 * Envs (server-only, NO NEXT_PUBLIC) en /docker/startidea-merch/.env:
 *   WHATSAPP_TOKEN            = token permanente del usuario de sistema
 *   WHATSAPP_PHONE_NUMBER_ID  = Phone Number ID (Configuración de la API)
 *   WHATSAPP_API_VERSION      = opcional, default v21.0
 *
 * Las plantillas referenciadas deben estar APROBADAS en Meta (ver
 * docs/whatsapp-templates.md): presupuesto_listo, enlace_pago, recordatorio_presupuesto.
 */
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

export function isWhatsAppApiConfigured(): boolean {
  return Boolean(TOKEN && PHONE_NUMBER_ID);
}

/**
 * Normaliza un teléfono a formato E.164 sin '+' (lo que pide la Cloud API):
 * solo dígitos; quita 00 inicial; si son 9 dígitos españoles (móvil/fijo) y
 * no traen prefijo, antepone 34. Devuelve null si no parece válido.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && /^[6789]/.test(d)) d = `34${d}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

export type WaTemplateResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

/**
 * Envía una plantilla aprobada a un número. `bodyParams` son los valores de
 * {{1}}..{{n}} del cuerpo, en orden.
 */
export async function sendWhatsAppTemplate(args: {
  to: string | null | undefined;
  template: string;
  language?: string;
  bodyParams?: string[];
}): Promise<WaTemplateResult> {
  if (!isWhatsAppApiConfigured()) {
    return { ok: false, error: "WhatsApp Cloud API no configurada", skipped: true };
  }
  const to = normalizePhone(args.to);
  if (!to) return { ok: false, error: "Teléfono inválido o ausente", skipped: true };

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: args.template,
      language: { code: args.language || "es" },
      ...(args.bodyParams && args.bodyParams.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: args.bodyParams.map((t) => ({ type: "text", text: t })),
              },
            ],
          }
        : {}),
    },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 200)}` };
    }
    return { ok: true, id: data?.messages?.[0]?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
