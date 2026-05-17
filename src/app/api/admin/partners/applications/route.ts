import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const apps = await prisma.partnerApplication.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { approvedPartner: { select: { id: true, slug: true, commissionPct: true, totalEarnedCents: true } } },
  });

  return NextResponse.json({ applications: apps });
}
