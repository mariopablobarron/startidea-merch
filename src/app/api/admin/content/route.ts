import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["POST", "STORY", "REEL", "CARRUSEL", "EMAIL", "AD", "BLOG", "LANDING"] as const;
const CHANNELS = [
  "IG", "FB", "LINKEDIN", "X", "TIKTOK", "YOUTUBE", "PINTEREST",
  "EMAIL", "WEB", "GOOGLE_ADS", "META_ADS", "LINKEDIN_ADS",
] as const;
const STATUSES = ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "ARCHIVED"] as const;

const CreateSchema = z.object({
  type: z.enum(TYPES),
  channel: z.enum(CHANNELS),
  title: z.string().max(200).nullable().optional(),
  copy: z.string().min(1).max(10_000),
  hashtags: z.array(z.string().min(1).max(40)).max(15).optional(),
  mentions: z.array(z.string().min(1).max(60)).max(10).optional(),
  creativeUrl: z.string().url().max(500).nullable().optional(),
  creativeBrief: z.string().max(2000).nullable().optional(),
  productSlug: z.string().max(160).nullable().optional(),
  campaignId: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const channel = url.searchParams.get("channel");
  const campaignId = url.searchParams.get("campaignId");
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.min(100, parseInt(url.searchParams.get("perPage") || "30", 10));

  const where: Prisma.ContentPieceWhereInput = {
    ...(status && STATUSES.includes(status as never) ? { status: status as never } : {}),
    ...(channel && CHANNELS.includes(channel as never) ? { channel: channel as never } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { copy: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contentPiece.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        title: true,
        copy: true,
        creativeUrl: true,
        productSlug: true,
        campaignId: true,
        campaign: { select: { name: true } },
        scheduledAt: true,
        publishedAt: true,
        createdBy: true,
        approvedBy: true,
        createdAt: true,
      },
    }),
    prisma.contentPiece.count({ where }),
  ]);

  return NextResponse.json({
    ok: true,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    items,
  });
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
  const piece = await prisma.contentPiece.create({
    data: {
      type: d.type,
      channel: d.channel,
      title: d.title ?? null,
      copy: d.copy,
      hashtags: d.hashtags || [],
      mentions: d.mentions || [],
      creativeUrl: d.creativeUrl ?? null,
      creativeBrief: d.creativeBrief ?? null,
      productSlug: d.productSlug ?? null,
      campaignId: d.campaignId || null,
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      status: d.scheduledAt ? "SCHEDULED" : "DRAFT",
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, piece });
}
