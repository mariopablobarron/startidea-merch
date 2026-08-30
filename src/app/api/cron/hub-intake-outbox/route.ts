import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { flushHubIntakeOutbox } from "@/lib/hub-intake-outbox";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = wrapCronHandler("hub-intake-outbox", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const result = await flushHubIntakeOutbox({ limit: 50 });
  return NextResponse.json({ ok: true, ...result });
});
