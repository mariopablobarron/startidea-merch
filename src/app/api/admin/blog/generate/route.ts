import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { generateBlogPost, ensureSlug } from "@/lib/blog-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({
  topic: z.string().min(5).max(500),
  keywordTarget: z.string().min(2).max(160),
  intent: z.enum(["INFORMATIONAL", "TRANSACTIONAL", "NAVIGATIONAL", "COMMERCIAL"]).optional(),
  targetWordCount: z.number().int().min(500).max(4000).optional(),
  internalLinks: z.array(z.string().url()).max(20).optional(),
  customInstructions: z.string().max(2000).optional(),
  persist: z.boolean().optional(),
});

/**
 * POST /api/admin/blog/generate
 * Genera un artículo completo con IA y opcionalmente lo persiste como DRAFT.
 * Si persist=true, devuelve {ok, post: {id, slug, ...}} para abrir el editor.
 * Si persist=false (default), devuelve {ok, generated} sin guardar.
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await generateBlogPost(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  if (!parsed.data.persist) {
    return NextResponse.json({ ok: true, generated: result.post });
  }

  // Persistir como DRAFT
  let slug = ensureSlug(result.post.slug);
  let attempt = 0;
  while (await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } })) {
    attempt++;
    slug = `${ensureSlug(result.post.title)}-${attempt}`;
    if (attempt > 20) break;
  }

  const post = await prisma.blogPost.create({
    data: {
      title: result.post.title,
      slug,
      excerpt: result.post.excerpt,
      bodyMd: result.post.bodyMd,
      metaTitle: result.post.metaTitle,
      metaDescription: result.post.metaDescription,
      keywordTarget: parsed.data.keywordTarget,
      intent: parsed.data.intent ?? "INFORMATIONAL",
      tags: result.post.tags,
      schemaJson: { faq: result.post.faq },
      status: "DRAFT",
      createdBy: session.email,
      author: session.name || session.email,
    },
  });

  return NextResponse.json({ ok: true, post, model: result.post.model });
}
