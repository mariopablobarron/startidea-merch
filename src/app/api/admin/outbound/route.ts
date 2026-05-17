import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_STATUSES = [
  "NEW", "INVITED", "CONNECTED", "MESSAGED", "REPLIED",
  "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "NURTURING",
] as const;

const CreateSchema = z.object({
  name: z.string().min(2).max(160),
  company: z.string().max(160).optional().nullable(),
  role: z.string().max(160).optional().nullable(),
  email: z.string().email().max(160).optional().nullable().or(z.literal("")),
  linkedinUrl: z.string().max(500).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  segment: z.string().max(40).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const where = statusFilter && ALL_STATUSES.includes(statusFilter as never)
    ? { status: statusFilter as (typeof ALL_STATUSES)[number] }
    : {};

  const [leads, counts] = await Promise.all([
    prisma.outboundLead.findMany({
      where,
      orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.outboundLead.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const summary = counts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r._count._all;
    return acc;
  }, {});

  return NextResponse.json({ leads, summary });
}

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const d = parsed.data;
  const created = await prisma.outboundLead.create({
    data: {
      name: d.name,
      company: d.company ?? null,
      role: d.role ?? null,
      email: d.email || null,
      linkedinUrl: d.linkedinUrl ?? null,
      phone: d.phone ?? null,
      segment: d.segment ?? null,
      source: d.source ?? null,
      notes: d.notes ?? null,
      ownerEmail: session.email,
    },
  });

  return NextResponse.json({ ok: true, lead: created });
}
