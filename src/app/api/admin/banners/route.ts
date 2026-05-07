import { NextResponse } from "next/server";
import { z } from "zod";
import type { BannerSlot, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS = [
  "HOME_TOP",
  "HOME_MID",
  "CATALOGO_TOP",
  "FICHA_PRODUCTO",
  "FOOTER",
] as const;

const CreateSchema = z.object({
  slot: z.enum(SLOTS),
  title: z.string().min(1).max(160),
  subtitle: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().max(80).nullable().optional(),
  ctaUrl: z.string().max(500).nullable().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  bgColor: z
    .string()
    .regex(/^#?[0-9a-fA-F]{3,8}$/, "Color hex inválido")
    .nullable()
    .optional(),
  textColor: z
    .string()
    .regex(/^#?[0-9a-fA-F]{3,8}$/, "Color hex inválido")
    .nullable()
    .optional(),
  active: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const slot = url.searchParams.get("slot") as BannerSlot | null;

  const where: Prisma.MarketingBannerWhereInput = slot && SLOTS.includes(slot as never) ? { slot } : {};

  const banners = await prisma.marketingBanner.findMany({
    where,
    orderBy: [{ slot: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ ok: true, banners });
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

  const data = parsed.data;
  const banner = await prisma.marketingBanner.create({
    data: {
      slot: data.slot,
      title: data.title,
      subtitle: data.subtitle ?? null,
      ctaLabel: data.ctaLabel ?? null,
      ctaUrl: data.ctaUrl ?? null,
      imageUrl: data.imageUrl ?? null,
      bgColor: normalizeHex(data.bgColor) ?? null,
      textColor: normalizeHex(data.textColor) ?? null,
      active: data.active ?? true,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      priority: data.priority ?? 0,
      updatedBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, banner });
}

function normalizeHex(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t) return null;
  return t.startsWith("#") ? t : `#${t}`;
}
