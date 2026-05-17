import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

const ItemSchema = z.object({
  product_slug: z.string().min(1),
  quantity: z.number().int().positive().max(1_000_000),
  marking_position_id: z.string().max(40).optional().nullable(),
  technique_code: z.string().max(20).optional().nullable(),
  number_of_colors: z.number().int().min(1).max(10).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const Schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  company: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  items: z.array(ItemSchema).min(1).max(20),
  voice_session_id: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Tool: submit_quote
 * Alma la llama tras confirmar verbalmente con el usuario que quiere cotización
 * formal. Necesita: nombre, email, empresa, y al menos 1 producto.
 *
 * Reutiliza el endpoint público /api/cart-quote para que TODO el flow
 * (validación, email confirmación, alerta Telegram, referral, etc.) pase
 * por el mismo camino que una cotización web. Esto evita divergencia y
 * mantiene la observabilidad central.
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  // 1) Resolver productos (cargar metadatos para componer CartQuoteItem)
  const slugs = data.items.map((i) => i.product_slug);
  const products = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, name: true, internalRef: true, primaryImageUrl: true, fromPriceCents: true },
  });
  if (products.length === 0) {
    return NextResponse.json({ error: "Ningún slug coincide con un producto activo" }, { status: 400 });
  }
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  // 2) Llamamos a /api/cart-quote (endpoint público existente) con shape compatible
  const itemsPayload = data.items
    .map((it) => {
      const p = bySlug.get(it.product_slug);
      if (!p) return null;
      return {
        productSlug: p.slug,
        productRef: p.internalRef || p.slug,
        productName: p.name,
        primaryImageUrl: p.primaryImageUrl,
        quantity: it.quantity,
        markingPositionId: it.marking_position_id || null,
        markingTechniqueCode: it.technique_code || null,
        numberOfColours: it.number_of_colors || null,
        notes: it.notes || null,
      };
    })
    .filter(Boolean);

  if (itemsPayload.length === 0) {
    return NextResponse.json({ error: "Los productos indicados no existen en catálogo" }, { status: 400 });
  }

  const internalRes = await fetch(`${SITE_URL}/api/cart-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      items: itemsPayload,
      message: (data.notes ? `${data.notes}\n\n` : "") + "[Cotización originada por agente de voz Alma]",
      source: "voice-agent",
    }),
  });

  if (!internalRes.ok) {
    const errText = (await internalRes.text()).slice(0, 300);
    return NextResponse.json(
      { error: `Error al crear cotización (HTTP ${internalRes.status})`, detail: errText },
      { status: 502 },
    );
  }

  const cartResp = await internalRes.json();
  const cartId: string | undefined = cartResp.id || cartResp.cartId;

  // 3) Atribuir al VoiceSession si nos pasaron su id
  if (data.voice_session_id && cartId) {
    await prisma.voiceSession.update({
      where: { id: data.voice_session_id },
      data: { resultingCartId: cartId },
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    cart_id: cartId || null,
    message:
      "Cotización registrada. Recibirás email de confirmación en menos de 1 minuto. Te enviamos cotización cerrada (con mockup técnico) en menos de 24 horas laborables.",
  });
}
