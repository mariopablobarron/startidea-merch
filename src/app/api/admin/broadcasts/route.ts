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
  "CUSTOMERS_ALL",
  "CART_QUOTES_RECENT",
] as const;

const CreateSchema = z.object({
  subject: z.string().min(1).max(200),
  preheader: z.string().max(200).nullable().optional(),
  html: z.string().min(1).max(200_000),
  text: z.string().max(200_000).nullable().optional(),
  audience: z.enum(AUDIENCES).default("NEWSLETTER_ALL"),
  scheduledAt: z.string().datetime().nullable().optional(),
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

  // Pre-calc audience sizes para mostrar en lista
  const sizes = await Promise.all(
    AUDIENCES.map(async (a) => [a, await estimateAudienceSize(a)] as const),
  );
  const audienceSizes = Object.fromEntries(sizes);

  return NextResponse.json({ ok: true, broadcasts, audienceSizes });
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
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      status: d.scheduledAt ? "SCHEDULED" : "DRAFT",
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, broadcast });
}
