import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/auth";
import { suppliers } from "@/lib/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const results = await Promise.all(
    Object.values(suppliers).map(async (s) => ({
      code: s.code,
      name: s.name,
      result: await s.ping(),
    })),
  );

  return NextResponse.json({ ts: new Date().toISOString(), suppliers: results });
}
