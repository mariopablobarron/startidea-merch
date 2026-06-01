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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const rules = await getNotificationRules();
  return NextResponse.json({ ok: true, rules });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  let body: Record<string, { enabled?: boolean; threshold?: number }> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  // Filtrar a eventos conocidos
  const known: NotificationEvent[] = [
    "proposal_received",
    "recommender_query",
    "search_no_results",
    "carmen_session",
    "stock_critical",
  ];
  const safe: Record<string, { enabled?: boolean; threshold?: number }> = {};
  for (const ev of known) {
    if (body[ev]) {
      safe[ev] = {
        enabled: typeof body[ev].enabled === "boolean" ? body[ev].enabled : undefined,
        threshold:
          typeof body[ev].threshold === "number" ? body[ev].threshold : undefined,
      };
    }
  }
  const updated = await setNotificationRules(safe as Parameters<typeof setNotificationRules>[0]);
  return NextResponse.json({ ok: true, rules: updated });
}
