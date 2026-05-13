import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, requireRole } from "@/lib/admin-auth";

const SETTING_KEY = "lookerSeoEmbedUrl";

const PutSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      (u) => u.startsWith("https://lookerstudio.google.com/embed/reporting/"),
      "Debe ser una URL de embed de Looker Studio (https://lookerstudio.google.com/embed/reporting/...)",
    )
    .or(z.literal("")),
});

export async function GET(req: Request) {
  const auth = await requireAdminSession(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const row = await prisma.siteSetting.findUnique({ where: { key: SETTING_KEY } });
  const url = row && typeof row.value === "string" ? row.value : "";
  return NextResponse.json({
    url,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  });
}

export async function PUT(req: Request) {
  const auth = await requireRole(req, "COMERCIAL");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos inválidos" },
      { status: 400 },
    );
  }

  await prisma.siteSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: parsed.data.url, updatedBy: auth.session.email },
    update: { value: parsed.data.url, updatedBy: auth.session.email },
  });

  return NextResponse.json({ ok: true });
}
