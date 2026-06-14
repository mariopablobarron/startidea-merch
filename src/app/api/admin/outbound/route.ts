import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

const PAGE_SIZE = 50;

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
  const source = (url.searchParams.get("source") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const where: Prisma.OutboundLeadWhereInput = {
    ...(statusFilter && ALL_STATUSES.includes(statusFilter as never)
      ? { status: statusFilter as (typeof ALL_STATUSES)[number] }
      : {}),
    ...(source ? { source } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { segment: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, total, counts, sourceGroups] = await Promise.all([
    prisma.outboundLead.findMany({
      where,
      orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.outboundLead.count({ where }),
    prisma.outboundLead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.outboundLead.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);

  const summary = counts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r._count._all;
    return acc;
  }, {});

  const sources = sourceGroups
    .map((s) => ({ source: s.source, count: s._count._all }))
    .filter((s): s is { source: string; count: number } => Boolean(s.source))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    leads,
    summary,
    sources,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
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
