import { NextResponse } from "next/server";
import { clearSessionCookieValue } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Set-Cookie": clearSessionCookieValue(), "Content-Type": "application/json" },
  });
}
