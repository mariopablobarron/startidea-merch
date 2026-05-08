import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SeoSchema = z
  .object({
    path: z.string().min(1).max(200).startsWith("/"),
    title: z.string().max(160).nullable().optional(),
    description: z.string().max(320).nullable().optional(),
    ogImage: z.string().max(500).nullable().optional(),
    robots: z.string().max(80).nullable().optional(),
    schemaJson: z.unknown().nullable().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rows = await prisma.pageSeo.findMany({ orderBy: { path: "asc" } });
  return NextResponse.json({ ok: true, items: rows });
}

export async function PUT(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = SeoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { path, ...data } = parsed.data;
  const cleanData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

  const result = await prisma.pageSeo.upsert({
    where: { path },
    update: { ...cleanData, updatedBy: session.email } as never,
    create: {
      path,
      ...cleanData,
      updatedBy: session.email,
    } as never,
  });

  return NextResponse.json({ ok: true, item: result });
}

export async function DELETE(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Falta path" }, { status: 400 });
  await prisma.pageSeo.delete({ where: { path } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
