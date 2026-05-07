import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Detalle CRM de un cliente (identificado por email único, lowercase).
 * GET    devuelve: profile (CustomerProfile), user (CustomerUser si existe),
 *        carts (CartQuote ordenados desc con totales), payments (PAID),
 *        deliveries (BroadcastDelivery — emails que ha recibido),
 *        kpis derivados (LTV, ticket medio, primer/último pedido).
 * PATCH  upsert tags/notes/segment del CustomerProfile.
 *
 * El email viene URL-encoded; lo normalizamos a lowercase.
 */

const PatchSchema = z
  .object({
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    notes: z.string().max(5000).nullable().optional(),
    segment: z
      .enum(["ENTERPRISE", "MIDMARKET", "STARTUP", "ONE_OFF", "PARTNER", "CHURNED"])
      .nullable()
      .optional(),
  })
  .strict();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { email: emailParam } = await params;
  const email = decodeURIComponent(emailParam).toLowerCase();

  const [profile, user, carts, deliveries] = await Promise.all([
    prisma.customerProfile.findUnique({ where: { email } }),
    prisma.customerUser.findUnique({
      where: { email },
      select: { id: true, name: true, lastLoginAt: true, createdAt: true },
    }),
    prisma.cartQuote.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        company: true,
        name: true,
        message: true,
        estimatedTotalCents: true,
        acceptedTotalCents: true,
        confirmedAt: true,
        items: { select: { quantity: true, productName: true }, take: 8 },
        payments: {
          where: { status: "PAID" },
          select: { amountCents: true, paidAt: true, kind: true },
        },
      },
      take: 100,
    }),
    prisma.broadcastDelivery.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { sentAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        sentAt: true,
        broadcast: { select: { id: true, subject: true } },
      },
    }),
  ]);

  // EmailDripSent no tiene relación nombrada con CartQuote, así que contamos
  // por cartId en una segunda query usando los IDs de los carts del cliente.
  const cartIds = carts.map((c) => c.id);
  const dripsSent = cartIds.length > 0
    ? await prisma.emailDripSent.count({ where: { cartId: { in: cartIds } } })
    : 0;

  // KPIs agregados
  const allPayments = carts.flatMap((c) => c.payments);
  const ltvCents = allPayments.reduce((s, p) => s + p.amountCents, 0);
  const paidCount = allPayments.length;
  const avgTicketCents = paidCount > 0 ? Math.round(ltvCents / paidCount) : 0;
  const firstPaidAt = allPayments
    .map((p) => p.paidAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const lastPaidAt = allPayments
    .map((p) => p.paidAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return NextResponse.json({
    ok: true,
    email,
    profile: profile ?? { email, tags: [], notes: null, segment: null },
    user,
    carts,
    deliveries,
    kpis: {
      ltvCents,
      paidCount,
      avgTicketCents,
      cartCount: carts.length,
      firstPaidAt: firstPaidAt ?? null,
      lastPaidAt: lastPaidAt ?? null,
      remindersDripSent: dripsSent,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { email: emailParam } = await params;
  const email = decodeURIComponent(emailParam).toLowerCase();

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  const profile = await prisma.customerProfile.upsert({
    where: { email },
    update: { ...data, updatedBy: session.email },
    create: { email, ...data, updatedBy: session.email },
  });

  return NextResponse.json({ ok: true, profile });
}
