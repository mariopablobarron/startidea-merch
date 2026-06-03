/**
 * POST /api/admin/suppliers/midocean/test
 *
 * Verifica conectividad con el gateway MidOcean leyendo /gateway/stock/2.0
 * (endpoint barato — solo HEAD-like). Reporta latencia y modo activo.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { midoceanClient } from "@/lib/suppliers/midocean";
import { describeMidoceanLiveOrders } from "@/lib/suppliers/midocean-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const apiKeyConfigured = !!process.env.MIDOCEAN_API_KEY;
  const liveDescription = await describeMidoceanLiveOrders();

  if (!apiKeyConfigured) {
    return NextResponse.json(
      {
        ok: false,
        stage: "credentials",
        message: "MIDOCEAN_API_KEY no configurada en el VPS",
        liveOrders: liveDescription,
      },
      { status: 400 },
    );
  }

  const t0 = Date.now();
  const ping = await midoceanClient.ping();
  const elapsedMs = Date.now() - t0;

  if (!ping.ok) {
    return NextResponse.json(
      {
        ok: false,
        stage: "request",
        elapsedMs,
        message: ping.reason,
        liveOrders: liveDescription,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    elapsedMs,
    message: `Ping a /gateway/stock/2.0 OK en ${elapsedMs} ms`,
    liveOrders: liveDescription,
  });
}
