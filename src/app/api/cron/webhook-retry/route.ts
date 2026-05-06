import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { retryPendingDeliveries } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reintenta webhook deliveries FAILED cuyo nextRetryAt ya pasó.
 * Llamar cada 15 min desde cron-job.org con X-Cron-Secret.
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const result = await retryPendingDeliveries();
  return NextResponse.json({ ok: true, ...result });
}
