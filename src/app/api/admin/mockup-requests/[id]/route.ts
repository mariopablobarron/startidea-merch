import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "DELIVERED", "CANCELLED"]).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data: {
    status?: "NEW" | "IN_PROGRESS" | "DELIVERED" | "CANCELLED";
    notes?: string | null;
    fulfilledAt?: Date | null;
    fulfilledBy?: string | null;
  } = {};

  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === "DELIVERED") {
      data.fulfilledAt = new Date();
      data.fulfilledBy = session.email;
    } else if (parsed.data.status === "NEW" || parsed.data.status === "IN_PROGRESS") {
      data.fulfilledAt = null;
      data.fulfilledBy = null;
    }
  }
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const updated = await prisma.mockupRequest.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true, request: updated });
}
