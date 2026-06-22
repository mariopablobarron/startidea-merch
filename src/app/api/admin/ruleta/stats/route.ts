import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { getRuletaPrizes } from "@/lib/ruleta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — KPIs de la ruleta para el panel admin. */
export async function GET(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const prizes = await getRuletaPrizes();

  const [spins, spins7d, couponsIssued, couponsRedeemed, leadsRuleta, leadsClassic, byPrizeCounts] =
    await Promise.all([
      prisma.newsletterSubscriber.count({ where: { tags: { has: "ruleta" } } }),
      prisma.newsletterSubscriber.count({ where: { tags: { has: "ruleta" }, optedInAt: { gte: since7d } } }),
      prisma.coupon.count({ where: { code: { startsWith: "RUL-" } } }),
      prisma.coupon.count({ where: { code: { startsWith: "RUL-" }, usedCount: { gt: 0 } } }),
      prisma.newsletterSubscriber.count({ where: { source: "ruleta" } }),
      prisma.newsletterSubscriber.count({ where: { source: "lead-popup" } }),
      Promise.all(
        prizes.map((p) =>
          prisma.newsletterSubscriber.count({ where: { tags: { has: `ruleta:${p.id}` } } }),
        ),
      ),
    ]);

  const byPrize = prizes.map((p, i) => ({
    id: p.id,
    label: p.label,
    kind: p.kind,
    count: byPrizeCounts[i],
  }));

  const redemptionRate = couponsIssued > 0 ? Math.round((couponsRedeemed / couponsIssued) * 100) : 0;

  return NextResponse.json({
    ok: true,
    stats: {
      spins,
      spins7d,
      couponsIssued,
      couponsRedeemed,
      redemptionRate,
      byPrize,
      bySource: { ruleta: leadsRuleta, classic: leadsClassic },
    },
  });
}
