import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin-session";
import { requireAdminSecret } from "@/lib/auth";
import type { QuoteStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS: QuoteStatus[] = ["NEW", "IN_PROGRESS", "SENT", "WON", "LOST", "ARCHIVED"];

async function authorize(req: Request) {
  if (await isAdmin()) return null;
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denial = await authorize(req);
  if (denial) return denial;
  const { id } = await ctx.params;
  const item = await prisma.quoteRequest.findUnique({
    where: { id },
    include: { notes: { orderBy: { createdAt: "desc" } } },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(item);
}

const PatchSchema = z.object({
  status: z.enum(VALID_STATUS as [QuoteStatus, ...QuoteStatus[]]).optional(),
  noteBody: z.string().min(1).max(2000).optional(),
  noteAuthor: z.string().min(1).max(120).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denial = await authorize(req);
  if (denial) return denial;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }

  const updates = parsed.data;
  const existing = await prisma.quoteRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (updates.status) {
    await prisma.quoteRequest.update({ where: { id }, data: { status: updates.status } });
  }

  if (updates.noteBody) {
    await prisma.quoteNote.create({
      data: {
        requestId: id,
        body: updates.noteBody,
        author: updates.noteAuthor || "admin",
      },
    });
  }

  const fresh = await prisma.quoteRequest.findUnique({
    where: { id },
    include: { notes: { orderBy: { createdAt: "desc" } } },
  });
  return NextResponse.json(fresh);
}
