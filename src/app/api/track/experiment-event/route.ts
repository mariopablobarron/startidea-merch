/**
 * POST /api/track/experiment-event
 *
 * Cuerpo: { experimentId, variantKey, event, anonId? }
 *
 * Tracking de eventos A/B. Fire-and-forget desde el cliente.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordExperimentEvent } from "@/lib/experiments";
import { trackRateLimit } from "@/lib/track-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  experimentId: z.string().min(1).max(40),
  variantKey: z.string().min(1).max(10),
  event: z.string().min(1).max(40),
  anonId: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const rl = trackRateLimit(req, "track-experiment-event");
  if (!rl.ok) return rl.response;

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await recordExperimentEvent(body.experimentId, body.variantKey, body.event, body.anonId);
  return NextResponse.json({ ok: true });
}
