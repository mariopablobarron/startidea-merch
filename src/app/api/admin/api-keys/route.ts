import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";
import { createApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  label: z.string().min(2).max(120),
  email: z.string().email(),
  company: z.string().max(160).optional(),
  scopes: z.array(z.enum(["read:catalog", "read:quote", "write:quote"])).default([
    "read:catalog",
    "read:quote",
    "write:quote",
  ]),
  rateLimit: z.number().int().positive().max(10000).default(100),
  notes: z.string().max(2000).optional(),
});

/** GET → lista API keys */
export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      email: true,
      company: true,
      keyPrefix: true,
      active: true,
      scopes: true,
      rateLimit: true,
      createdAt: true,
      lastUsedAt: true,
      notes: true,
    },
  });
  return NextResponse.json({ ok: true, keys });
}

/** POST → genera nueva API key */
export async function POST(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { plain, prefix, hash } = createApiKey();
  const key = await prisma.apiKey.create({
    data: {
      label: parsed.data.label,
      email: parsed.data.email,
      company: parsed.data.company,
      keyPrefix: prefix,
      secretHash: hash,
      scopes: parsed.data.scopes,
      rateLimit: parsed.data.rateLimit,
      notes: parsed.data.notes,
    },
  });
  // Devolvemos el key plain UNA SOLA VEZ
  return NextResponse.json({
    ok: true,
    id: key.id,
    keyPrefix: prefix,
    plainKey: plain,
    warning: "Guarda esta key ahora. No podrás verla de nuevo.",
  });
}

/** DELETE ?id= → desactiva (soft delete) */
export async function DELETE(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.apiKey.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
