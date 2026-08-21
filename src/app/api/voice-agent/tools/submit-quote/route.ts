import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { publicProductName } from "@/lib/product-name";
import { resolveProductsBySlugs } from "@/lib/product-slug-resolver";
import { rateLimit } from "@/lib/rate-limit";
import { SubmitQuoteSchema, SUBMIT_QUOTE_RATE_LIMIT } from "@/lib/voice-submit-quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";


/**
 * Tool: submit_quote
 * Carmen la llama tras confirmar verbalmente con el usuario que quiere cotización
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

  // Defensa en profundidad: el secreto es el único control, y cada llamada que
  // pasa crea un CartQuote, manda email al cliente y avisa al Telegram del
  // equipo. Un bucle del agente o un secreto filtrado llenaría el panel de
  // leads. Mismo cupo que request-callback.
  const rl = rateLimit(req, SUBMIT_QUOTE_RATE_LIMIT);
  if (!rl.ok) return rl.response;

  const body = await req.json().catch(() => ({}));
  const parsed = SubmitQuoteSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  // 1) Resolver productos (cargar metadatos para componer CartQuoteItem)
  const slugs = data.items.map((i) => i.product_slug);
  const resolvedProducts = await resolveProductsBySlugs(slugs, (candidateSlugs) =>
    prisma.product.findMany({
      where: { slug: { in: [...candidateSlugs] } },
      select: {
        id: true,
        slug: true,
        name: true,
        internalRef: true,
        primaryImageUrl: true,
        fromPriceCents: true,
        override: { select: { customName: true } },
      },
    }),
  );
  if (resolvedProducts.size === 0) {
    return NextResponse.json({ error: "Ningún slug coincide con un producto activo" }, { status: 400 });
  }

  // 2) Llamamos a /api/cart-quote (endpoint público existente) con shape compatible
  const itemsPayload = data.items
    .map((it) => {
      const resolved = resolvedProducts.get(it.product_slug);
      if (!resolved) return null;
      const p = resolved.product;
      // Resolver marcas: si vienen array, usarlo; si no, intentar reconstruirlo
      // desde campos planos (1 marca) para compat.
      const markings = it.markings && it.markings.length > 0
        ? it.markings.map((m) => ({
            positionId: m.position_id,
            techniqueCode: m.technique_code,
            numberOfColors: m.number_of_colors || 1,
            notes: m.notes || null,
          }))
        : it.marking_position_id && it.technique_code
          ? [{
              positionId: it.marking_position_id,
              techniqueCode: it.technique_code,
              numberOfColors: it.number_of_colors || 1,
              notes: null,
            }]
          : [];

      return {
        productSlug: p.slug,
        productRef: p.internalRef || p.slug,
        productName: publicProductName(p.name, p.override?.customName),
        primaryImageUrl: proxyImageUrl(p.primaryImageUrl), // guardar proxy, nunca crudo
        quantity: it.quantity,
        // shape plano (primer marcaje, compat) + array completo
        markingPositionId: markings[0]?.positionId || null,
        markingTechniqueCode: markings[0]?.techniqueCode || null,
        markingColours: markings[0]?.numberOfColors || null,
        markings: markings.length > 0 ? markings : undefined,
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
      message: (data.notes ? `${data.notes}\n\n` : "") + "[Cotización originada por agente de voz Carmen]",
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
      "Cotización registrada. Recibirás email de confirmación en menos de 1 minuto. Si pediste mockup técnico o condiciones especiales, te lo cerramos en menos de 24h laborables.",
  });
}
