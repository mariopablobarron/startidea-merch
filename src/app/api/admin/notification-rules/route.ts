/**
 * GET  /api/admin/notification-rules → reglas actuales
 * POST /api/admin/notification-rules → actualizar (body = parcial)
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import {
  getNotificationRules,
  setNotificationRules,
  type NotificationEvent,
} from "@/lib/notification-rules";
import { getSlackWebhookUrl, setSlackWebhookUrl } from "@/lib/slack-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const [rules, slackUrl] = await Promise.all([
    getNotificationRules(),
    getSlackWebhookUrl(),
  ]);
  return NextResponse.json({
    ok: true,
    rules,
    slackWebhookUrl: slackUrl,
    slackConfigured: !!slackUrl,
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  let body: { rules?: Record<string, { enabled?: boolean; threshold?: number }>; slackWebhookUrl?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  const known: NotificationEvent[] = [
    "proposal_received",
    "recommender_query",
    "search_no_results",
    "carmen_session",
    "stock_critical",
  ];
  const safeRules: Record<string, { enabled?: boolean; threshold?: number }> = {};
  for (const ev of known) {
    if (body.rules?.[ev]) {
      safeRules[ev] = {
        enabled: typeof body.rules[ev].enabled === "boolean" ? body.rules[ev].enabled : undefined,
        threshold:
          typeof body.rules[ev].threshold === "number"
            ? body.rules[ev].threshold
            : undefined,
      };
    }
  }
  const updated = await setNotificationRules(
    safeRules as Parameters<typeof setNotificationRules>[0],
  );

  if (typeof body.slackWebhookUrl !== "undefined") {
    const url = body.slackWebhookUrl?.trim() || null;
    if (url && !/^https?:\/\/(hooks\.slack\.com|discord\.com|discordapp\.com)\//i.test(url)) {
      return NextResponse.json(
        { error: "INVALID_WEBHOOK", message: "URL debe ser Slack o Discord" },
        { status: 400 },
      );
    }
    await setSlackWebhookUrl(url);
  }
  const slackUrl = await getSlackWebhookUrl();
  return NextResponse.json({
    ok: true,
    rules: updated,
    slackWebhookUrl: slackUrl,
    slackConfigured: !!slackUrl,
  });
}
