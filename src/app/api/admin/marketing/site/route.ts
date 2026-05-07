import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { DEFAULT_SETTINGS, type SiteSettingsMap } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CMS site settings — leer y guardar copy editable de la home.
 *
 * GET   → devuelve mapa completo (override + defaults).
 * PUT   → guarda parcial. Solo CEO o COMERCIAL pueden editar.
 *
 * Body PUT:
 *   { settings: { "hero.h1Prefix": "...", "hero.ctaPrimary": {label,href}, ... } }
 */

const CtaLinkSchema = z.object({
  label: z.string().min(1).max(80),
  href: z.string().min(1).max(200),
});

// Schema validates each known key with its expected type
const SettingsSchema = z.object({
  "hero.badge": z.string().min(1).max(120).optional(),
  "hero.h1Prefix": z.string().min(1).max(160).optional(),
  "hero.h1Accent": z.string().min(1).max(80).optional(),
  "hero.subhead": z.string().min(1).max(500).optional(),
  "hero.ctaPrimary": CtaLinkSchema.optional(),
  "hero.ctaSecondary": CtaLinkSchema.optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rows = await prisma.siteSetting.findMany();
  const overrides = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return NextResponse.json({
    ok: true,
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    defaults: DEFAULT_SETTINGS,
    overridden: rows.map((r) => r.key),
  });
}

export async function PUT(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json(
      { error: "Solo CEO o COMERCIAL pueden editar marketing" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = SettingsSchema.safeParse(body.settings || {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Array<keyof SiteSettingsMap> = [];

  for (const [key, value] of Object.entries(parsed.data) as [
    keyof SiteSettingsMap,
    SiteSettingsMap[keyof SiteSettingsMap],
  ][]) {
    if (value === undefined) continue;
    await prisma.siteSetting.upsert({
      where: { key },
      update: {
        value: value as object,
        updatedBy: session.email,
      },
      create: {
        key,
        value: value as object,
        updatedBy: session.email,
      },
    });
    updates.push(key);
  }

  return NextResponse.json({ ok: true, updated: updates });
}

export async function DELETE(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "CEO") {
    return NextResponse.json({ error: "Solo CEO puede resetear" }, { status: 403 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Falta key" }, { status: 400 });

  await prisma.siteSetting.delete({ where: { key } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
