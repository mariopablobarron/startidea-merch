import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const cart = await prisma.cartQuote.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!cart) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(cart);
}

const PatchSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "SENT", "CONFIRMED", "ORDERED", "ARCHIVED"]).optional(),
  internalNotes: z.string().max(4000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const updated = await prisma.cartQuote.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ ok: true, cart: updated });
}
