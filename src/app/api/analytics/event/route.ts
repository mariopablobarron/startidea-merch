import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { AnalyticsEventSchema } from "@/lib/analytics-event-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recibe eventos de analítica del cliente. Fire-and-forget desde el browser
 * (sendBeacon o fetch keepalive). No requiere auth — es público y anónimo.
 */
export async function POST(req: Request) {
  // Tope generoso a propósito: el sitio entero genera ~420 eventos AL DÍA
  // (39.533 pageviews en 94 días), así que 60 por minuto y por IP es ~8x todo
  // el tráfico diario concentrado en un minuto desde una sola IP. No estorba a
  // una oficina entera detrás del mismo NAT — que es el caso normal en B2B — y
  // corta el goteo de quien quiera engordar la tabla.
  const rl = rateLimit(req, { key: "analytics-event", max: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = AnalyticsEventSchema.safeParse(body);
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
