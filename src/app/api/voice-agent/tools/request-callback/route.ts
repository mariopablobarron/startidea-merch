import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVoiceAgentToolSecret } from "@/lib/voice-agent-auth";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(40),
  email: z.string().email().max(160).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  preferred_time: z.string().max(120).optional().nullable(), // "esta tarde", "mañana 10h", etc.
  reason: z.string().max(2000).optional().nullable(), // por qué pide callback (qué quiere)
  voice_session_id: z.string().max(80).optional().nullable(),
});

/**
 * Tool: request_callback
 *
 * David la llama cuando el cliente prefiere hablar con humano antes de
 * cerrar cotización. Útil cuando:
 *   - Pedido grande (>2 000€) que el cliente quiere validar con persona
 *   - Cliente confundido con técnicas/plazos
 *   - Cliente no tiene email accesible pero sí tlf
 *   - Cliente menciona "hablar con alguien" o "que me llamen"
 *
 * Crea CartQuote stub con status=NEW + message="[CALLBACK]" + alerta
 * Telegram inmediata + email interno. Mario lo ve en /admin/cart-quotes
 * filtrable.
 */
export async function POST(req: Request) {
  const auth = requireVoiceAgentToolSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Crear CartQuote stub para que aparezca en /admin/cart-quotes (Mario tiene
  // un solo panel de leads, no inventamos otra tabla)
  const messageParts = [
    "[CALLBACK SOLICITADO POR VOICE AGENT]",
    `Hora preferida: ${d.preferred_time || "Sin especificar"}`,
    d.reason ? `Razón: ${d.reason}` : null,
    "",
    "El cliente prefiere hablar con persona antes de cerrar. Llamar al tlf indicado.",
  ]
    .filter(Boolean)
    .join("\n");

  const cart = await prisma.cartQuote.create({
    data: {
      name: d.name,
      email: d.email || `callback-${Date.now()}@no-email.local`,
      company: d.company || null,
      phone: d.phone,
      message: messageParts,
      source: "voice-agent-callback",
      status: "NEW",
    },
    select: { id: true },
  });

  // Atribución a VoiceSession
  if (d.voice_session_id) {
    await prisma.voiceSession
      .update({
        where: { id: d.voice_session_id },
        data: { resultingCartId: cart.id },
      })
      .catch((e) =>
        console.error("[request-callback] atribuir VoiceSession falló:", e instanceof Error ? e.message : e),
      );
  }

  // Notificación INMEDIATA a Mario (TG + email)
  const tgMsg = [
    `📞 <b>CALLBACK SOLICITADO · VOZ AGENT</b>`,
    `Cliente: ${escapeTgHtml(d.name)}${d.company ? ` · ${escapeTgHtml(d.company)}` : ""}`,
    `Tlf: <code>${escapeTgHtml(d.phone)}</code>`,
    d.email ? `Email: ${d.email}` : "",
    `Hora: ${escapeTgHtml(d.preferred_time || "Sin especificar — llamar lo antes posible")}`,
    "",
    d.reason ? `Quiere: ${escapeTgHtml(d.reason)}` : "",
    "",
    `<a href="https://merchandising.startidea.es/admin/cart-quotes/${cart.id}">Abrir en /admin</a>`,
  ]
    .filter(Boolean)
    .join("\n");
  void notifyTelegram(tgMsg).catch((e) =>
    console.error("[request-callback] notifyTelegram falló:", e instanceof Error ? e.message : e),
  );

  // Email interno (backup)
  void sendEmail({
    to: RESEND_TO_INTERNAL,
    subject: `📞 Callback solicitado: ${d.name}${d.company ? " · " + d.company : ""}`,
    html: `
      <h2>Callback solicitado vía voice agent David</h2>
      <p><strong>Cliente:</strong> ${escapeHtml(d.name)}${d.company ? ` · ${escapeHtml(d.company)}` : ""}</p>
      <p><strong>Teléfono:</strong> <a href="tel:${encodeURIComponent(d.phone)}">${escapeHtml(d.phone)}</a></p>
      ${d.email ? `<p><strong>Email:</strong> ${escapeHtml(d.email)}</p>` : ""}
      <p><strong>Hora preferida:</strong> ${escapeHtml(d.preferred_time || "Sin especificar")}</p>
      ${d.reason ? `<p><strong>Razón:</strong> ${escapeHtml(d.reason)}</p>` : ""}
      <p style="margin-top:24px"><a href="https://merchandising.startidea.es/admin/cart-quotes/${cart.id}" style="background:#C8102E;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir en admin</a></p>
    `,
  }).catch((e) =>
    console.error("[request-callback] sendEmail interno falló:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({
    ok: true,
    cart_id: cart.id,
    message: `Perfecto, ${d.name.split(" ")[0]}. Hemos registrado tu solicitud de llamada. Te contactamos al ${d.phone}${d.preferred_time ? ` ${d.preferred_time}` : " lo antes posible"}. Si surge algo urgente, también puedes escribirnos a pedidos@startidea.es.`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
