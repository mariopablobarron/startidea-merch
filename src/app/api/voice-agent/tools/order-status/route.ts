import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().email().max(160),
  // Pista opcional: nº/fragmento de referencia que el cliente recuerde.
  order_ref: z.string().max(80).optional().nullable(),
});

/**
 * Tool: estado_pedido
 *
 * Diego la usa cuando un cliente EXISTENTE pregunta "¿cómo va mi pedido?".
 * Identificación mínima: el email con el que hizo el pedido. Devuelve estado
 * humano + seguimiento del transportista si lo hay.
 *
 * PRIVACIDAD (endpoint alcanzable por cualquiera que hable con Diego):
 *  - NUNCA direcciones, importes ni datos de facturación
 *  - Solo pedidos del email EXACTO; sin búsqueda difusa
 *  - Items resumidos (2 nombres) para que el cliente reconozca el pedido
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "email requerido (el del pedido)" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const ref = parsed.data.order_ref?.trim().toLowerCase() || null;

  const carts = await prisma.cartQuote.findMany({
    where: {
      email,
      status: { in: ["SENT", "CONFIRMED", "ORDERED"] },
      ...(ref ? { id: { contains: ref, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      createdAt: true,
      status: true,
      items: { select: { productName: true, quantity: true }, take: 2 },
      payments: {
        where: { status: "PAID" },
        select: { paidAt: true },
        orderBy: { paidAt: "desc" },
        take: 1,
      },
      trackings: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: { status: true, trackingCode: true, carrier: true, carrierUrl: true, fetchedAt: true },
      },
    },
  });

  const STATUS_HUMANO: Record<string, string> = {
    SENT: "presupuesto enviado, pendiente de tu confirmación",
    CONFIRMED: "confirmado, en preparación",
    ORDERED: "pedido en marcha (producción/envío)",
  };

  const orders = carts.map((c) => {
    const t = c.trackings[0];
    return {
      // Referencia corta y pronunciable: últimos 6 del id.
      ref: c.id.slice(-6).toUpperCase(),
      created_at: c.createdAt.toISOString().slice(0, 10),
      status: STATUS_HUMANO[c.status] ?? c.status.toLowerCase(),
      paid: c.payments.length > 0,
      paid_at: c.payments[0]?.paidAt?.toISOString().slice(0, 10) ?? null,
      items_summary: c.items
        .map((it) => `${it.quantity} × ${it.productName}`)
        .join(", "),
      tracking: t
        ? {
            carrier: t.carrier,
            status: t.status,
            code: t.trackingCode,
            url: t.carrierUrl,
            updated_at: t.fetchedAt.toISOString().slice(0, 10),
          }
        : null,
    };
  });

  return NextResponse.json({
    count: orders.length,
    orders,
    note:
      orders.length === 0
        ? "Sin pedidos activos para ese email. Pide al cliente que confirme el email exacto del pedido; si insiste, ofrece request_callback para que el equipo lo mire a mano."
        : "Da el estado en UNA frase por pedido. Si hay tracking con url, dile que el enlace de seguimiento está en su email de confirmación y en el portal de cliente. NUNCA des direcciones ni importes.",
  });
}
