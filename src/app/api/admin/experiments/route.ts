/**
 * GET  /api/admin/experiments → lista todos
 * POST /api/admin/experiments → crear/upsert experiment
 * PATCH /api/admin/experiments → toggle active
 * DELETE /api/admin/experiments?id= → borrar
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VariantSchema = z.object({
  key: z.string().min(1).max(10),
  weight: z.number().int().min(1).max(100),
  config: z.record(z.string(), z.unknown()),
});

const PostSchema = z.object({
  slug: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  variants: z.array(VariantSchema).min(2).max(4),
  active: z.boolean().default(false),
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
  const sumWeights = body.variants.reduce((s, v) => s + v.weight, 0);
  if (sumWeights !== 100) {
    return NextResponse.json(
      { error: "INVALID_WEIGHTS", message: `Los pesos deben sumar 100, no ${sumWeights}` },
      { status: 400 },
    );
  }
  const exp = await prisma.experiment.upsert({
    where: { slug: body.slug },
    create: {
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      variants: body.variants as unknown as Prisma.InputJsonValue,
      active: body.active,
      startedAt: body.active ? new Date() : null,
    },
    update: {
      name: body.name,
      description: body.description ?? null,
      variants: body.variants as unknown as Prisma.InputJsonValue,
      active: body.active,
      startedAt: body.active ? new Date() : null,
    },
  });
  return NextResponse.json({ ok: true, experiment: exp });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  let body: { id?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  const exp = await prisma.experiment.update({
    where: { id: body.id },
    data: {
      active: !!body.active,
      startedAt: body.active ? new Date() : undefined,
      endedAt: !body.active ? new Date() : undefined,
    },
  });
  return NextResponse.json({ ok: true, experiment: exp });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  await prisma.experiment.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
