import { prisma } from "@/lib/prisma";
import { sendPush, isPushConfigured, type PushPayload } from "@/lib/web-push";
import { notifySlack } from "@/lib/slack-webhook";
import {
  getEnabledChannels,
  type NotificationEvent,
} from "@/lib/notification-rules";

/**
 * Envía una notificación a los canales admin configurados:
 *  - Push browser (web-push API, suscripciones en PushSubscription)
 *  - Slack/Discord webhook (URL en AdminSetting.slack_webhook_url)
 *
 * Si se pasa `event`, respeta el routing per-channel definido por el admin
 * en /admin/insights/notifications. Si no se pasa (cron, sistema interno,
 * tests), envía a ambos canales por compatibilidad.
 *
 * Fire-and-forget desde el caller — no bloquea la respuesta del endpoint.
 * Limpia suscripciones expiradas (404/410) automáticamente.
 */
export async function notifyAdmins(
  payload: PushPayload,
  options?: { event?: NotificationEvent },
): Promise<void> {
  const channels = options?.event
    ? await getEnabledChannels(options.event)
    : { push: true, slack: true };

  // Slack/Discord en paralelo (no bloquea push)
  if (channels.slack) {
    void notifySlack({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.url,
    }).catch((e) =>
      console.error("[notify-admin] notifySlack falló:", e instanceof Error ? e.message : e),
    );
  }

  // Push browser
  if (!channels.push) return;
  if (!isPushConfigured()) return;
  const subs = await prisma.pushSubscription.findMany();
  if (subs.length === 0) return;
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendPush(s, payload);
      if (r.gone) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch((e) =>
          console.error("[notify-admin] delete PushSubscription falló:", e instanceof Error ? e.message : e),
        );
      } else if (r.ok) {
        await prisma.pushSubscription
          .update({ where: { id: s.id }, data: { lastUsedAt: new Date() } })
          .catch((e) =>
            console.error("[notify-admin] update PushSubscription falló:", e instanceof Error ? e.message : e),
          );
      }
    }),
  );
}
