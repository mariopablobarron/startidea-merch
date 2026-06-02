/**
 * POST /api/admin/integrations/rotate-secret
 *
 * Rota el secret del webhook de integraciones. El antiguo deja de
 * funcionar inmediatamente, así que avisa a tus sistemas conectados
 * antes de pulsar.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import { rotateWebhookSecret } from "@/lib/incoming-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const newSecret = await rotateWebhookSecret();
  return NextResponse.json({ ok: true, secret: newSecret });
}
