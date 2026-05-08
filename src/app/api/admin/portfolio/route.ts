import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  imageUrl: z.string().url().max(500),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  clientName: z.string().max(120).nullable().optional(),
  productSlug: z.string().max(160).nullable().optional(),
  sector: z.string().max(40).nullable().optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(9999).optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const items = await prisma.portfolioItem.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
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
  const item = await prisma.portfolioItem.create({
    data: { ...parsed.data, updatedBy: session.email },
  });
  return NextResponse.json({ ok: true, item });
}
