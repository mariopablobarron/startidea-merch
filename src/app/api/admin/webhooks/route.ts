import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { generateWebhookSecret, emitWebhook } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  apiKeyId: z.string().optional(),
  url: z.string().url().max(500),
  events: z
    .array(z.enum(["quote.status.changed", "payment.completed", "proof.status.changed"]))
    .min(1),
});

export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const eps = await prisma.webhookEndpoint.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { deliveries: true } },
      apiKey: { select: { label: true, company: true } },
    },
  });
  return NextResponse.json({ ok: true, endpoints: eps });
}

export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });

  const secret = generateWebhookSecret();
  const ep = await prisma.webhookEndpoint.create({
    data: {
      apiKeyId: parsed.data.apiKeyId,
      url: parsed.data.url,
      events: parsed.data.events,
      secret,
    },
  });
  return NextResponse.json({
    ok: true,
    endpointId: ep.id,
    secret,
    warning: "Guarda este secret. Necesitas usarlo para validar la firma X-Merch-Signature en tu endpoint receptor. No podrás verlo de nuevo.",
  });
}

export async function DELETE(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.webhookEndpoint.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}

/** Test endpoint: dispara un test.ping al endpoint indicado. */
export async function PATCH(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const ep = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Forzar el evento incluso si el endpoint no lo tiene en events
  await prisma.webhookEndpoint.update({ where: { id }, data: { events: { set: [...new Set([...ep.events, "test.ping"])] } } });
  await emitWebhook("test.ping" as never, { hello: "world", at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
