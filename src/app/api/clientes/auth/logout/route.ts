import { NextResponse } from "next/server";
import { clearCustomerCookieValue } from "@/lib/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: "/clientes/login",
      "Set-Cookie": clearCustomerCookieValue(),
    },
  });
}
