import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  type: z.string().min(1).max(60),
  path: z.string().max(500).optional(),
  productSlug: z.string().max(120).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().max(60).optional(),
});

/**
 * Recibe eventos de analítica del cliente. Fire-and-forget desde el browser
 * (sendBeacon o fetch keepalive). No requiere auth — es público y anónimo.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const ua = req.headers.get("user-agent")?.slice(0, 500) || null;

  // Persistencia best-effort — si la DB falla, devolvemos 200 igualmente
  try {
    await prisma.analyticsEvent.create({
      data: {
        type: parsed.data.type,
        path: parsed.data.path,
        productSlug: parsed.data.productSlug,
        payload: parsed.data.payload as never,
        sessionId: parsed.data.sessionId,
        userAgent: ua,
      },
    });
  } catch (err) {
    console.error("[analytics event]", err);
  }

  return NextResponse.json({ ok: true });
}
