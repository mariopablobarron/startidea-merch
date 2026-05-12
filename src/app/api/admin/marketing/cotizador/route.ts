import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { DEFAULT_QUOTE_SETTINGS, getQuoteSettings } from "@/lib/quote-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z
  .object({
    heroTitle: z.string().min(1).max(200).optional(),
    heroSubtitle: z.string().max(300).optional(),
    heroBullets: z.array(z.string().min(1).max(200)).max(8).optional(),
    responseHours: z.number().int().min(1).max(720).optional(),
    requireCompany: z.boolean().optional(),
    requirePhone: z.boolean().optional(),
    requireDeadline: z.boolean().optional(),
    showBudgetField: z.boolean().optional(),
    deadlineOptions: z.array(z.string().min(1).max(80)).max(10).optional(),
    paymentMethods: z.array(z.string().min(1).max(80)).max(10).optional(),
    successTitle: z.string().min(1).max(200).optional(),
    successMessage: z.string().min(1).max(500).optional(),
    autoReplyEnabled: z.boolean().optional(),
    autoReplySubject: z.string().max(200).optional(),
    autoReplyHtml: z.string().max(30_000).optional(),
    internalNotifyEmails: z.array(z.string().email()).max(10).optional(),
    showOnHome: z.boolean().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const settings = await getQuoteSettings();
  return NextResponse.json({ ok: true, settings, defaults: DEFAULT_QUOTE_SETTINGS });
}

export async function PUT(req: Request) {
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

  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  const updated = await prisma.quoteSettings.upsert({
    where: { id: "default" },
    update: { ...data, updatedBy: session.email },
    create: {
      id: "default",
      ...DEFAULT_QUOTE_SETTINGS,
      ...data,
      updatedBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, settings: updated });
}
