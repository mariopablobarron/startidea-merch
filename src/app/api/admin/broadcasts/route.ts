import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { estimateAudienceSize } from "@/lib/broadcast-audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUDIENCES = [
  "NEWSLETTER_ALL",
  "NEWSLETTER_NEW",
  "NEWSLETTER_TAG",
  "CUSTOMERS_ALL",
  "CART_QUOTES_RECENT",
] as const;

const CreateSchema = z
  .object({
    subject: z.string().min(1).max(200),
    preheader: z.string().max(200).nullable().optional(),
    html: z.string().min(1).max(200_000),
    text: z.string().max(200_000).nullable().optional(),
    audience: z.enum(AUDIENCES).default("NEWSLETTER_ALL"),
    audienceTags: z.array(z.string().min(1).max(60)).max(20).default([]),
    scheduledAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.audience === "NEWSLETTER_TAG" && d.audienceTags.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["audienceTags"],
        message: "NEWSLETTER_TAG requiere al menos un tag en audienceTags",
      });
    }
  });

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const broadcasts = await prisma.emailBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      audience: true,
      status: true,
      scheduledAt: true,
      sentAt: true,
      sentCount: true,
      failedCount: true,
      createdAt: true,
      createdBy: true,
    },
  });

  // Pre-calc audience sizes para mostrar en lista (sin NEWSLETTER_TAG —
  // ese depende de qué tags se elijan, se calcula al crear el broadcast)
  const sizes = await Promise.all(
    AUDIENCES.filter((a) => a !== "NEWSLETTER_TAG").map(
      async (a) => [a, await estimateAudienceSize(a)] as const,
    ),
  );
  const audienceSizes = Object.fromEntries(sizes);

  // Estadísticas de apertura por broadcast (deliveries con openedAt).
  const opens = await prisma.broadcastDelivery.groupBy({
    by: ["broadcastId"],
    where: { broadcastId: { in: broadcasts.map((b) => b.id) }, openedAt: { not: null } },
    _count: { _all: true },
  });
  const openMap = new Map(opens.map((o) => [o.broadcastId, o._count._all]));
  const withStats = broadcasts.map((b) => ({
    ...b,
    openedCount: openMap.get(b.id) ?? 0,
    openRate: b.sentCount > 0 ? Math.round(((openMap.get(b.id) ?? 0) / b.sentCount) * 100) : 0,
  }));

  return NextResponse.json({ ok: true, broadcasts: withStats, audienceSizes });
}

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const broadcast = await prisma.emailBroadcast.create({
    data: {
      subject: d.subject,
      preheader: d.preheader ?? null,
      html: d.html,
      text: d.text ?? null,
      audience: d.audience,
      audienceTags: d.audience === "NEWSLETTER_TAG" ? d.audienceTags : [],
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      status: d.scheduledAt ? "SCHEDULED" : "DRAFT",
      createdBy: session.email,
    },
  });

  // Computa el tamaño real (en caso TAG, depende de los tags elegidos)
  const estimated = await estimateAudienceSize(d.audience, d.audienceTags);

  return NextResponse.json({ ok: true, broadcast, estimatedRecipients: estimated });
}
