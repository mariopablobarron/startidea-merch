import { prisma } from "@/lib/prisma";
import { sendPush, isPushConfigured, type PushPayload } from "@/lib/web-push";

/**
 * Envía una notificación push a todos los administradores suscritos.
 * Fire-and-forget desde el caller — no bloquea la respuesta del endpoint.
 * Limpia suscripciones expiradas (404/410) automáticamente.
 */
export async function notifyAdmins(payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  const subs = await prisma.pushSubscription.findMany();
  if (subs.length === 0) return;
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendPush(s, payload);
      if (r.gone) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      } else if (r.ok) {
        await prisma.pushSubscription
          .update({ where: { id: s.id }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
      }
    }),
  );
}
