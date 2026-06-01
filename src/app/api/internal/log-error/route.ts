/**
 * POST /api/internal/log-error
 *
 * Captura errores del cliente (window.onerror, unhandledrejection) en
 * ErrorEvent. Sin necesidad de Sentry.
 *
 * Endpoint público pero rate-limited (10/min/IP) para evitar abuso.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { captureError } from "@/lib/insights/capture-error";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(5000).optional(),
  url: z.string().max(500).optional(),
  context: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(req, {
    key: "log-error",
    max: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) return rl.response;

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const fakeErr = new Error(body.message);
  if (body.stack) fakeErr.stack = body.stack;

  captureError(fakeErr, {
    severity: "error",
    context: body.context ?? "client",
    url: body.url,
    userAgent: req.headers.get("user-agent") ?? undefined,
    notifyAdmin: false,
  });

  return NextResponse.json({ ok: true });
}
