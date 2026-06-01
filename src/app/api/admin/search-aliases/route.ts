/**
 * API admin para gestionar SearchAlias.
 *
 *   POST   /api/admin/search-aliases       crear/upsert
 *   DELETE /api/admin/search-aliases?id=… eliminar
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  query: z.string().min(2).max(120),
  redirectTo: z.string().min(1).max(300),
  description: z.string().max(300).optional().nullable(),
  active: z.boolean().default(true),
});

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  let body;
  try {
    body = PostSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "INVALID", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  const queryLower = body.query.trim().toLowerCase();
  const alias = await prisma.searchAlias.upsert({
    where: { queryLower },
    create: {
      queryLower,
      redirectTo: body.redirectTo.trim(),
      description: body.description ?? null,
      active: body.active,
    },
    update: {
      redirectTo: body.redirectTo.trim(),
      description: body.description ?? null,
      active: body.active,
    },
  });
  return NextResponse.json({ ok: true, alias });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  await prisma.searchAlias.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
