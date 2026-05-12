import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { campaignSlugFromName } from "@/lib/content-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OBJECTIVES = ["LEADS", "CONVERSIONS", "TRAFFIC", "AWARENESS", "RETENTION"] as const;

const Schema = z.object({
  name: z.string().min(2).max(120),
  objective: z.enum(OBJECTIVES).default("LEADS"),
  channels: z.array(z.string().min(1).max(40)).max(15),
  budgetCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    include: { _count: { select: { pieces: true } } },
    take: 100,
  });
  return NextResponse.json({ ok: true, campaigns });
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
  // utm_campaign único — añade suffix si colisiona
  let utm = campaignSlugFromName(d.name);
  let suffix = 0;
  while (await prisma.campaign.findUnique({ where: { utmCampaign: utm }, select: { id: true } })) {
    suffix++;
    utm = `${campaignSlugFromName(d.name)}-${suffix}`;
    if (suffix > 20) break;
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: d.name,
      objective: d.objective,
      channels: d.channels,
      budgetCents: d.budgetCents ?? null,
      startsAt: new Date(d.startsAt),
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
      utmCampaign: utm,
      createdBy: session.email,
    },
  });

  return NextResponse.json({ ok: true, campaign });
}
