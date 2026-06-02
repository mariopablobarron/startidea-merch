/**
 * GET  /api/admin/suppliers/makito/mode → { mode, credentialsLoaded }
 * POST /api/admin/suppliers/makito/mode { mode: "sandbox" | "production" }
 *
 * Permite alternar el modo activo del cliente B2B sin redeploy. Cambiar
 * a producción procesa pedidos REALES — la UI confirma antes.
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import {
  getMakitoB2BMode,
  setMakitoB2BMode,
  type MakitoB2BMode,
} from "@/lib/suppliers/makito-b2b";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function describeCreds() {
  return {
    sandboxLoaded:
      !!process.env.MAKITO_B2B_SANDBOX_CLIENT_ID &&
      !!process.env.MAKITO_B2B_SANDBOX_CLIENT_SECRET,
    productionLoaded:
      !!process.env.MAKITO_B2B_PROD_CLIENT_ID &&
      !!process.env.MAKITO_B2B_PROD_CLIENT_SECRET,
  };
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  const mode = await getMakitoB2BMode();
  return NextResponse.json({ ok: true, mode, ...describeCreds() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  let body: { mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  if (body.mode !== "sandbox" && body.mode !== "production") {
    return NextResponse.json(
      { error: "BAD_MODE", message: 'mode debe ser "sandbox" o "production"' },
      { status: 400 },
    );
  }
  await setMakitoB2BMode(body.mode as MakitoB2BMode);
  return NextResponse.json({ ok: true, mode: body.mode, ...describeCreds() });
}
