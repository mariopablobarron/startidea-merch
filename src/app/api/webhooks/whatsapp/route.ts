import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de WhatsApp Business Cloud API (Meta) — RECEPCIÓN.
 *
 * GET  → verificación del webhook (Meta envía hub.challenge al darlo de alta).
 *        Requiere WHATSAPP_WEBHOOK_VERIFY_TOKEN (la misma cadena que pongas en
 *        Meta al configurar el webhook).
 * POST → mensajes entrantes. Verifica la firma con WHATSAPP_APP_SECRET
 *        (X-Hub-Signature-256) y avisa al equipo por Telegram.
 *
 * Durmiente hasta configurar: sin el verify token, la verificación GET falla
 * (es lo esperado hasta que des de alta el webhook en Meta).
 */
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Verifica X-Hub-Signature-256 (HMAC-SHA256 del cuerpo con el App Secret). */
function verifySignature(body: string, header: string | null): boolean {
  if (!APP_SECRET) return true; // sin secret configurado, no bloqueamos (dormido)
  if (!header) return false;
  const expected = "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const body = await req.text();
  if (!verifySignature(body, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: Array<{ from?: string; type?: string; text?: { body?: string } }>;
        };
      }>;
    }>;
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: true }); // 200 siempre para que Meta no reintente en bucle
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const name = value?.contacts?.[0]?.profile?.name;
      for (const msg of value?.messages ?? []) {
        const from = msg.from || value?.contacts?.[0]?.wa_id || "?";
        const text = msg.type === "text" ? msg.text?.body || "" : `[${msg.type}]`;
        void notifyTelegram(
          `📲 <b>WhatsApp entrante</b>\n${name ? `${name} · ` : ""}+${from}\n${text.slice(0, 500)}`,
        ).catch((e) =>
          console.error("[webhooks-whatsapp] notifyTelegram falló:", e instanceof Error ? e.message : e),
        );
      }
    }
  }

  // Meta exige 200 rápido o reintenta. Procesamos fire-and-forget arriba.
  return NextResponse.json({ ok: true });
}
