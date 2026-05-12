import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const Schema = z.object({
  slug: z.string().max(80).optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).nullable().optional(),
  fileUrl: z.string().url().max(500),
  heroUrl: z.string().url().max(500).nullable().optional(),
  category: z.string().max(40).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(15).optional(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const items = await prisma.leadMagnet.findMany({
    orderBy: [{ active: "desc" }, { featured: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { downloads: true } } },
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  let slug = d.slug ? slugify(d.slug) : slugify(d.title);
  let attempt = 0;
  while (await prisma.leadMagnet.findUnique({ where: { slug }, select: { id: true } })) {
    attempt++;
    slug = `${slugify(d.title)}-${attempt}`;
    if (attempt > 20) break;
  }

  const magnet = await prisma.leadMagnet.create({
    data: {
      slug,
      title: d.title,
      description: d.description ?? null,
      fileUrl: d.fileUrl,
      heroUrl: d.heroUrl ?? null,
      category: d.category ?? null,
      tags: d.tags || [],
      active: d.active ?? true,
      featured: d.featured ?? false,
      createdBy: session.email,
    },
  });
  return NextResponse.json({ ok: true, magnet });
}
