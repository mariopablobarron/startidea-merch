/**
 * GET  /api/admin/suppliers/midocean/live-orders → estado actual + origen
 * POST /api/admin/suppliers/midocean/live-orders   body: { live: boolean }
 *
 * Toggle del modo live para POST /orders sin redeploy. Persistido en
 * AdminSetting.midocean_live_orders, sobreescribe el env legacy.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import {
  describeMidoceanLiveOrders,
  setMidoceanLiveOrders,
} from "@/lib/suppliers/midocean-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const state = await describeMidoceanLiveOrders();
  return NextResponse.json({ ok: true, ...state });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  let body: { live?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  if (typeof body.live !== "boolean") {
    return NextResponse.json(
      { error: "BAD_PAYLOAD", message: "live debe ser true|false" },
      { status: 400 },
    );
  }
  await setMidoceanLiveOrders(body.live);
  const state = await describeMidoceanLiveOrders();
  return NextResponse.json({ ok: true, ...state });
}
