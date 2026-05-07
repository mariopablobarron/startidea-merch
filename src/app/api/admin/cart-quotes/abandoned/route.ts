import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Carritos abandonados — para enviar recordatorio "ups, se te quedó en el carrito".
 *
 * Definición:
 *  - status ∈ {NEW, IN_PROGRESS} (no enviado, no confirmado, no pedido)
 *  - tiene email para poder contactar
 *  - tiene al menos 1 item
 *  - createdAt > 4h (no spamear nada más añadir, dale tiempo)
 *  - reminderSentAt NULL  → nunca recordado
 *    O reminderSentAt > 48h → cooldown desde último envío
 *
 * Devuelve hasta 100 ordenados por más antiguo (mayor riesgo de pérdida).
 */
export async function GET(req: Request) {
  const auth = requireAdminSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(req.url);
  const minHours = parseInt(url.searchParams.get("minHours") || "4", 10);
  const cooldownHours = parseInt(url.searchParams.get("cooldownHours") || "48", 10);

  const since = new Date(Date.now() - minHours * 60 * 60 * 1000);
  const cooldown = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

  const carts = await prisma.cartQuote.findMany({
    where: {
      status: { in: ["NEW", "IN_PROGRESS"] },
      email: { not: "" },
      createdAt: { lt: since },
      OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: cooldown } }],
      items: { some: {} }, // tiene al menos 1 item
    },
    orderBy: [{ reminderSentAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      createdAt: true,
      name: true,
      company: true,
      email: true,
      status: true,
      estimatedTotalCents: true,
      reminderSentAt: true,
      reminderCount: true,
      items: {
        select: { quantity: true, productName: true, primaryImageUrl: true },
        take: 4,
      },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    count: carts.length,
    items: carts.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      hoursOld: Math.floor((Date.now() - c.createdAt.getTime()) / 3_600_000),
      name: c.name,
      company: c.company,
      email: c.email,
      status: c.status,
      itemsCount: c._count.items,
      topItems: c.items.slice(0, 3).map((it) => `${it.quantity}× ${it.productName}`),
      estimatedTotalCents: c.estimatedTotalCents,
      reminderSentAt: c.reminderSentAt,
      reminderCount: c.reminderCount,
    })),
  });
}
