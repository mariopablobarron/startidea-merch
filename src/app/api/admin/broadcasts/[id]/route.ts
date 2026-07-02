import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    subject: z.string().min(1).max(200).optional(),
    preheader: z.string().max(200).nullable().optional(),
    html: z.string().min(1).max(200_000).optional(),
    text: z.string().max(200_000).nullable().optional(),
    audience: z
      .enum([
        "NEWSLETTER_ALL",
        "NEWSLETTER_NEW",
        "NEWSLETTER_TAG",
        "NEWSLETTER_ENGAGED",
        "NEWSLETTER_DORMANT",
        "NEWSLETTER_SOURCE",
        "CUSTOMERS_ALL",
        "CART_QUOTES_RECENT",
      ])
      .optional(),
    audienceTags: z.array(z.string().min(1).max(60)).max(20).optional(),
    audienceSource: z.string().max(80).nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    status: z.enum(["DRAFT", "SCHEDULED", "CANCELED"]).optional(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const b = await prisma.emailBroadcast.findUnique({ where: { id } });
  if (!b) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Estadísticas de engagement (aperturas/clics) desde los deliveries.
  // openedAt/clickedAt → destinatarios ÚNICOS que abrieron/clicaron;
  // openCount/clickCount → aperturas/clics TOTALES (un mismo email puede abrir varias veces).
  const [delivered, opened, clicked, bounced, agg] = await Promise.all([
    prisma.broadcastDelivery.count({ where: { broadcastId: id, deliveredAt: { not: null } } }),
    prisma.broadcastDelivery.count({ where: { broadcastId: id, openedAt: { not: null } } }),
    prisma.broadcastDelivery.count({ where: { broadcastId: id, clickedAt: { not: null } } }),
    prisma.broadcastDelivery.count({ where: { broadcastId: id, bouncedAt: { not: null } } }),
    prisma.broadcastDelivery.aggregate({
      where: { broadcastId: id },
      _sum: { openCount: true, clickCount: true },
    }),
  ]);
  const stats = {
    delivered,
    opened,
    clicked,
    bounced,
    // Tasa de rebote sobre enviados. >3% = mala reputación → warmup/limpieza de lista.
    bounceRate: b.sentCount > 0 ? Math.round((bounced / b.sentCount) * 100) : 0,
    // % de entrega sobre enviados (Resend email.delivered). Solo cuenta para
    // broadcasts enviados DESPUÉS de activar el webhook email.delivered.
    deliveryRate: b.sentCount > 0 ? Math.round((delivered / b.sentCount) * 100) : 0,
    openRate: b.sentCount > 0 ? Math.round((opened / b.sentCount) * 100) : 0,
    // Apertura sobre ENTREGADOS (más honesto que sobre enviados cuando la entrega no es total).
    openRateOnDelivered: delivered > 0 ? Math.round((opened / delivered) * 100) : 0,
    clickRate: b.sentCount > 0 ? Math.round((clicked / b.sentCount) * 100) : 0,
    totalOpens: agg._sum.openCount ?? 0,
    totalClicks: agg._sum.clickCount ?? 0,
  };
  return NextResponse.json({ ok: true, broadcast: { ...b, stats } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.emailBroadcast.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (existing.status === "SENDING" || existing.status === "SENT") {
    return NextResponse.json(
      { error: `No se puede editar broadcast en estado ${existing.status}` },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const updated = await prisma.emailBroadcast.update({
    where: { id },
    data: {
      ...d,
      scheduledAt:
        d.scheduledAt !== undefined ? (d.scheduledAt ? new Date(d.scheduledAt) : null) : undefined,
    },
  });
  return NextResponse.json({ ok: true, broadcast: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.emailBroadcast.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
