import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { ensureSlug } from "@/lib/blog-generator";
import {
  notifyGoogleIndexing,
  isGoogleIndexingConfigured,
} from "@/lib/google-indexing";
import { submitToIndexNow, isIndexNowConfigured } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    slug: z.string().max(80).optional(),
    excerpt: z.string().max(400).nullable().optional(),
    bodyMd: z.string().min(50).max(80_000).optional(),
    heroUrl: z.string().url().max(500).nullable().optional(),
    metaTitle: z.string().max(160).nullable().optional(),
    metaDescription: z.string().max(320).nullable().optional(),
    keywordTarget: z.string().max(160).nullable().optional(),
    intent: z.enum(["INFORMATIONAL", "TRANSACTIONAL", "NAVIGATIONAL", "COMMERCIAL"]).optional(),
    tags: z.array(z.string().min(1).max(40)).max(15).optional(),
    schemaJson: z.unknown().nullable().optional(),
    status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]).optional(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, post });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const d = parsed.data;
  // Si cambian slug, asegurar único
  let slug = d.slug ? ensureSlug(d.slug) : undefined;
  if (slug && slug !== existing.slug) {
    const dup = await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (dup && dup.id !== id) return NextResponse.json({ error: "Slug ya existe" }, { status: 409 });
  }

  // Si publica por primera vez, marcar publishedAt
  const isPublishing =
    d.status === "PUBLISHED" && existing.status !== "PUBLISHED";

  const updated = await prisma.blogPost.update({
    where: { id },
    data: {
      ...d,
      ...(slug ? { slug } : {}),
      schemaJson: d.schemaJson !== undefined ? (d.schemaJson as object) : undefined,
      ...(isPublishing ? { publishedAt: new Date() } : {}),
    },
  });

  // Si acaba de publicarse, notificar a los proveedores configurados
  // (Google Indexing + IndexNow para Bing/Yandex/DDG). Fire-and-forget:
  // si fallan no rompemos la respuesta del admin.
  if (isPublishing) {
    const SITE_URL =
      process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";
    const url = `${SITE_URL}/blog/${updated.slug}`;
    if (isGoogleIndexingConfigured()) {
      void notifyGoogleIndexing([url], "URL_UPDATED").catch((e) =>
        console.error("[blog publish] Google Indexing fallo:", e),
      );
    }
    if (isIndexNowConfigured()) {
      void submitToIndexNow([url]).catch((e) =>
        console.error("[blog publish] IndexNow fallo:", e),
      );
    }
  }

  return NextResponse.json({ ok: true, post: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede borrar" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.blogPost.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
