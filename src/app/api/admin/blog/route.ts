import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { ensureSlug } from "@/lib/blog-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTENTS = ["INFORMATIONAL", "TRANSACTIONAL", "NAVIGATIONAL", "COMMERCIAL"] as const;

const CreateSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().max(80).optional(),
  excerpt: z.string().max(400).nullable().optional(),
  bodyMd: z.string().min(50).max(80_000),
  heroUrl: z.string().url().max(500).nullable().optional(),
  metaTitle: z.string().max(160).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  keywordTarget: z.string().max(160).nullable().optional(),
  intent: z.enum(INTENTS).optional(),
  tags: z.array(z.string().min(1).max(40)).max(15).optional(),
  schemaJson: z.unknown().nullable().optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.min(100, parseInt(url.searchParams.get("perPage") || "30", 10));

  const where: Prisma.BlogPostWhereInput = {
    ...(status ? { status: status as never } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { keywordTarget: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ status: "asc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        keywordTarget: true,
        intent: true,
        status: true,
        tags: true,
        publishedAt: true,
        createdAt: true,
        createdBy: true,
      },
    }),
    prisma.blogPost.count({ where }),
  ]);

  return NextResponse.json({ ok: true, items, total, page, perPage });
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
  let slug = d.slug ? ensureSlug(d.slug) : ensureSlug(d.title);
  // Garantizar único — si existe, añadir sufijo
  let attempt = 0;
  while (await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } })) {
    attempt++;
    slug = `${ensureSlug(d.title)}-${attempt}`;
    if (attempt > 20) break;
  }

  const post = await prisma.blogPost.create({
    data: {
      title: d.title,
      slug,
      excerpt: d.excerpt ?? null,
      bodyMd: d.bodyMd,
      heroUrl: d.heroUrl ?? null,
      metaTitle: d.metaTitle ?? d.title.slice(0, 160),
      metaDescription: d.metaDescription ?? d.excerpt?.slice(0, 320) ?? null,
      keywordTarget: d.keywordTarget ?? null,
      intent: d.intent ?? "INFORMATIONAL",
      tags: d.tags || [],
      schemaJson: (d.schemaJson as object) || undefined,
      status: "DRAFT",
      createdBy: session.email,
      author: session.name || session.email,
    },
  });

  return NextResponse.json({ ok: true, post });
}
