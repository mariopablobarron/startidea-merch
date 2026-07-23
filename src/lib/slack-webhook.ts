/**
 * Webhook genérico tipo Slack/Discord para notificaciones admin.
 *
 * URL configurable desde /admin/insights/notifications (campo
 * SLACK_WEBHOOK_URL en AdminSetting).
 *
 * Formato simple: {text} compatible con Slack + Discord + cualquier
 * webhook que acepte JSON con campo "text".
 */
import { prisma } from "@/lib/prisma";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.startidea.es";

let CACHE: { at: number; url: string | null } | null = null;
const CACHE_TTL = 60_000;

export async function getSlackWebhookUrl(): Promise<string | null> {
  if (CACHE && Date.now() - CACHE.at < CACHE_TTL) return CACHE.url;
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: "slack_webhook_url" },
      select: { value: true },
    });
    const url = typeof row?.value === "string" ? row.value : null;
    const isValid = !!url && /^https?:\/\/(hooks\.slack\.com|discord\.com|discordapp\.com)\//i.test(url);
    CACHE = { at: Date.now(), url: isValid ? url : null };
    return CACHE.url;
  } catch {
    return null;
  }
}

export async function setSlackWebhookUrl(url: string | null): Promise<void> {
  if (url) {
    await prisma.adminSetting.upsert({
      where: { key: "slack_webhook_url" },
      create: { key: "slack_webhook_url", value: url },
      update: { value: url },
    });
  } else {
    await prisma.adminSetting.delete({ where: { key: "slack_webhook_url" } }).catch(() => {});
  }
  CACHE = { at: Date.now(), url };
}

export type SlackPayload = {
  title: string;
  body: string;
  url?: string; // url relativa al sitio (se prefija con SITE_URL)
};

export async function notifySlack(payload: SlackPayload): Promise<boolean> {
  const webhookUrl = await getSlackWebhookUrl();
  if (!webhookUrl) return false;

  const fullUrl = payload.url
    ? payload.url.startsWith("http")
      ? payload.url
      : `${SITE_URL}${payload.url}`
    : null;

  const isDiscord = /discord(app)?\.com/i.test(webhookUrl);

  let body: object;
  if (isDiscord) {
    body = {
      embeds: [
        {
          title: payload.title,
          description: payload.body,
          url: fullUrl,
          color: 0xc8341b, // accent-deep
        },
      ],
    };
  } else {
    // Slack — usa Block Kit para formato bonito
    body = {
      text: `*${payload.title}*\n${payload.body}${fullUrl ? `\n<${fullUrl}|Abrir →>` : ""}`,
    };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
