import webpush from "web-push";

/**
 * Web Push helper. Usa VAPID keys que generas con:
 *   pnpm dlx web-push generate-vapid-keys
 *
 * Setear en envs:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT (mailto:tu-email@dominio.es)
 */

const PUBLIC = process.env.VAPID_PUBLIC_KEY;
const PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:hola@merchandising.startidea.es";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!PUBLIC || !PRIVATE) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
  return true;
}

export const VAPID_PUBLIC_KEY = PUBLIC;

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Envía una notificación a una suscripción concreta. Devuelve true si OK,
 * false si la suscripción ha expirado (404/410) — en ese caso conviene
 * limpiarla de la BD.
 */
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<{ ok: boolean; gone: boolean; statusCode?: number; error?: string }> {
  if (!ensureConfigured()) {
    return { ok: false, gone: false, error: "VAPID no configurado" };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
    );
    return { ok: true, gone: false };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string };
    const status = e?.statusCode || 0;
    const gone = status === 404 || status === 410;
    return {
      ok: false,
      gone,
      statusCode: status,
      error: e?.body || (err instanceof Error ? err.message : String(err)),
    };
  }
}

export function isPushConfigured(): boolean {
  return !!(PUBLIC && PRIVATE);
}
