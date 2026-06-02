/**
 * POST /api/integrations/event
 *
 * Endpoint genérico para que sistemas externos (Zapier, Make, n8n, cron
 * propio) disparen eventos custom. El secret va en el header
 * `x-webhook-secret` (generado en /admin/insights/integrations).
 *
 * Body:
 *   {
 *     source: "typeform" | "zapier" | "custom" | ...,
 *     type:   "form_submitted" | "order_delivered" | "anything",
 *     payload: { ... }
 *   }
 *
 * Las filas creadas aparecen en /admin/insights/integrations. Si no se
 * marca como processed por nadie, simplemente queda como log.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSecret } from "@/lib/incoming-webhook";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  source: z.string().min(1).max(50),
  type: z.string().min(1).max(80),
  payload: z.unknown(),
});

export async function POST(req: Request) {
  const rl = rateLimit(req, {
    key: "integrations-event",
    max: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) return rl.response;

  const secret = req.headers.get("x-webhook-secret");
  if (!(await verifyWebhookSecret(secret))) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const event = await prisma.incomingWebhookEvent.create({
    data: {
      source: body.source.toLowerCase(),
      type: body.type.toLowerCase(),
      payload: body.payload as object,
    },
  });

  return NextResponse.json({ ok: true, id: event.id });
}
