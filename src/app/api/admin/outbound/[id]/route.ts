import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  company: z.string().max(160).optional().nullable(),
  role: z.string().max(160).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  linkedinUrl: z.string().max(500).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  segment: z.string().max(40).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  status: z
    .enum(["NEW", "INVITED", "CONNECTED", "MESSAGED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "NURTURING"])
    .optional(),
  nextActionInDays: z.number().int().min(0).max(365).optional(), // helper rápido
  notes: z.string().max(4000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  for (const k of ["name", "company", "role", "email", "linkedinUrl", "phone", "segment", "source", "notes"] as const) {
    if (d[k] !== undefined) data[k] = d[k] || null;
  }
  if (d.status !== undefined) {
    data.status = d.status;
    // Cualquier cambio de status cuenta como "lo toqué hoy"
    data.lastContactAt = new Date();
  }
  if (d.nextActionInDays !== undefined) {
    data.nextActionAt = d.nextActionInDays > 0
      ? new Date(Date.now() + d.nextActionInDays * 24 * 60 * 60 * 1000)
      : null;
  }

  const updated = await prisma.outboundLead.update({ where: { id }, data });
  return NextResponse.json({ ok: true, lead: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  await prisma.outboundLead.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
