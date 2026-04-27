import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/auth";
import { pingAll } from "@/lib/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const suppliers = await pingAll();
  return NextResponse.json({ ts: new Date().toISOString(), suppliers });
}
