import { NextResponse } from "next/server";
import { runTelegramAdminAgent } from "@/lib/telegram-admin-agent";
import { sendTelegramTo } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // el agente puede encadenar varias tools

/**
 * Webhook entrante del bot admin de Telegram.
 *
 * Seguridad en dos capas:
 *  1. Header `x-telegram-bot-api-secret-token` — lo fija setWebhook y Telegram
 *     lo manda en CADA update; sin match, 401 (nadie puede inyectar updates).
 *  2. Allowlist de chats (TELEGRAM_ADMIN_CHAT_IDS, csv) — solo esos chats
 *     hablan con el agente. Fallback: el chat de notificaciones del equipo.
 *     A un chat NO autorizado se le responde su chat_id (para poder añadirlo)
 *     y nada más.
 *
 * Patrón fire-and-forget: Telegram reintenta si no respondes rápido, así que
 * devolvemos 200 inmediato y el agente responde por sendMessage cuando acaba.
 */

function allowedChatIds(): Set<string> {
  const csv =
    process.env.TELEGRAM_ADMIN_CHAT_IDS ||
    process.env.TELEGRAM_TEAM_CHAT_ID ||
    process.env.TELEGRAM_CHAT_ID ||
    "";
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

type TelegramUpdate = {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
  };
};

const HELP = [
  "🤖 <b>Carmen — asistente comercial</b>",
  "Pídeme lo que necesites en lenguaje natural:",
  "· «busca botellas térmicas por menos de 5€»",
  "· «cotiza 300 camisetas con serigrafía a 2 colores»",
  "· «¿stock y colores de STM-82A8NU?»",
  "· «¿cómo va el pedido de [empresa]?»",
  "· «¿cuánto hemos facturado esta semana?»",
  "· «¿promociones activas?» · «estado del sistema»",
].join("\n");

export async function POST(req: Request) {
  // Capa 1: secret del webhook.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET no configurado" }, { status: 503 });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true }); // update ilegible → ack y fuera
  }

  const msg = update.message;
  const text = msg?.text?.trim();
  if (!msg || !text || msg.from?.is_bot) {
    return NextResponse.json({ ok: true }); // stickers, fotos, edits… se ignoran
  }

  const chatId = String(msg.chat.id);

  // Capa 2: allowlist.
  if (!allowedChatIds().has(chatId)) {
    console.warn(`[telegram-webhook] chat NO autorizado: ${chatId} (${msg.from?.username ?? "?"})`);
    void sendTelegramTo(
      chatId,
      `Este chat no está autorizado. Si eres del equipo, pide que añadan este id a TELEGRAM_ADMIN_CHAT_IDS: <code>${chatId}</code>`,
    );
    return NextResponse.json({ ok: true });
  }

  if (text === "/start" || text === "/help" || text === "/ayuda") {
    void sendTelegramTo(chatId, HELP);
    return NextResponse.json({ ok: true });
  }

  // Fire-and-forget: ack inmediato a Telegram; la respuesta llega por sendMessage.
  void (async () => {
    try {
      const reply = await runTelegramAdminAgent(chatId, text);
      // Telegram corta en 4096 chars por mensaje.
      for (let i = 0; i < reply.length; i += 4000) {
        await sendTelegramTo(chatId, reply.slice(i, i + 4000));
      }
    } catch (e) {
      console.error("[telegram-webhook] agente falló:", e instanceof Error ? e.message : e);
      void sendTelegramTo(chatId, "⚠️ Se me ha atragantado esa. Reformula o inténtalo de nuevo.");
    }
  })();

  return NextResponse.json({ ok: true });
}
