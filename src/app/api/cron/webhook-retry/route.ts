import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { retryStripePostPayments } from "@/lib/stripe-post-payment";
import { retryPendingDeliveries } from "@/lib/webhooks";
import { withCronLock } from "@/lib/cron-lock";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reintenta webhook deliveries FAILED cuyo nextRetryAt ya pasó.
 * Recupera también postpagos durables, sin repetir efectos externos inciertos.
 * Cron del VPS cada 15 minutos, autenticado con X-Cron-Secret.
 */
export const POST = wrapCronHandler("webhook-retry", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return withCronLock("webhook-retry", async () => {
  const result = await retryPendingDeliveries();
  const postPayment = await retryStripePostPayments();
  return NextResponse.json({ ok: true, ...result, postPayment });
  }) as Promise<NextResponse>;
});
