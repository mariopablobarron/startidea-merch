/**
 * POST /api/admin/suppliers/cifra/test
 *
 * Llama ping() del cliente Cifra. Reporta latencia y conteo.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { ping } from "@/lib/suppliers/cifra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const tokenConfigured = !!process.env.CIFRA_API_TOKEN;
  if (!tokenConfigured) {
    return NextResponse.json(
      {
        ok: false,
        stage: "credentials",
        message: "CIFRA_API_TOKEN no configurado en el VPS",
      },
      { status: 400 },
    );
  }
  const t0 = Date.now();
  const result = await ping();
  const elapsedMs = Date.now() - t0;
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, stage: "request", elapsedMs, message: result.reason },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    elapsedMs,
    itemsSampled: result.itemsSampled,
    message: `Cifra devolvió ${result.itemsSampled} productos en ${elapsedMs} ms`,
  });
}
