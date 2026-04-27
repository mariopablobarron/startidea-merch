import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { syncAll } from "@/lib/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — sync nocturno largo

export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const results = await syncAll();
  return NextResponse.json({ ts: new Date().toISOString(), results });
}
