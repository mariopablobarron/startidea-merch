/**
 * POST /api/admin/notification-rules/test
 *
 * Dispara una notificación de prueba a todos los canales admin (push
 * browser + Slack/Discord). Útil para validar que la configuración
 * está bien sin esperar a que llegue un evento real.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { notifyAdmins } from "@/lib/notify-admin";
import { getSlackWebhookUrl } from "@/lib/slack-webhook";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const [slackUrl, pushSubsCount] = await Promise.all([
    getSlackWebhookUrl(),
    prisma.pushSubscription.count(),
  ]);

  const now = new Date().toLocaleTimeString("es-ES");
  await notifyAdmins({
    title: "🧪 Notificación de prueba",
    body: `Si ves esto, la configuración funciona. Disparada a las ${now}.`,
    url: "/admin/insights/notifications",
    tag: `test-${Date.now()}`,
  });

  return NextResponse.json({
    ok: true,
    channels: {
      slack: !!slackUrl,
      push: pushSubsCount,
    },
    message: "Notificación enviada — debería llegarte en segundos.",
  });
}
