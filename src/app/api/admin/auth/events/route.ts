import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Últimos accesos al panel (auditoría). Solo CEO. */
export async function GET(req: Request) {
  const auth = await requireRole(req); // sin roles extra → solo CEO pasa
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const events = await prisma.adminLoginEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      email: true,
      method: true,
      ok: true,
      reason: true,
      ip: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ ok: true, events });
}
