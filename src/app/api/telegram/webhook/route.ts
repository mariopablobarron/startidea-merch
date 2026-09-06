import { after, NextResponse } from "next/server";
import { z } from "zod";
import { runTelegramAdminAgent } from "@/lib/telegram-admin-agent";
import { sendTelegramTo } from "@/lib/telegram";
import { isAuthorizedTelegramSender } from "@/lib/telegram-admin-policy";
import { isTelegramMenuRequest, TELEGRAM_ADMIN_HELP, TELEGRAM_ADMIN_MENU } from "@/lib/telegram-admin-menu";
import { claimTelegramUpdate, finishTelegramUpdate } from "@/lib/telegram-update-receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const updateSchema = z.object({
  update_id: z.number().int().nonnegative().safe(),
  message: z.object({
    message_id: z.number().int().nonnegative().safe(),
    date: z.number().int().nonnegative().safe(),
    text: z.string().max(4096).optional(),
    chat: z.object({ id: z.number().int().safe(), type: z.string() }),
    from: z.object({ id: z.number().int().positive().safe(), is_bot: z.boolean().optional() }).optional(),
  }).optional(),
});

function allowedChatIds(): Set<string> {
  const csv = process.env.TELEGRAM_ADMIN_CHAT_IDS || process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";
  return new Set(csv.split(",").map((id) => id.trim()).filter(Boolean));
}

/** El secreto autentica Telegram; la allowlist y el remitente autentican el
 * chat personal. Aún no vincula el actor a un AdminUser: por eso el agente solo
 * consulta y cualquier cambio requiere la sesión del panel.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 16_384) return NextResponse.json({ ok: true });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });
  const update = parsed.data;
  const msg = update.message;
  const text = msg?.text?.trim();
  if (!msg || !text || !isAuthorizedTelegramSender(msg, allowedChatIds())) {
    // Grupos y remitentes desconocidos no reciben datos ni abren un turno LLM.
    return NextResponse.json({ ok: true });
  }
  const age = Date.now() / 1000 - msg.date;
  if (age > 24 * 3600 || age < -300) return NextResponse.json({ ok: true });

  const actor = { actorId: String(msg.from!.id), chatId: String(msg.chat.id), messageId: msg.message_id };
  let token: string;
  try {
    const claimed = await claimTelegramUpdate(update.update_id, actor);
    if (!claimed) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    token = claimed;
  } catch {
    console.error("[telegram-webhook] no se pudo registrar la entrega");
    return NextResponse.json({ error: "Temporalmente no disponible" }, { status: 503 });
  }
  // Next mantiene el trabajo tras el ACK. El recibo evita repetirlo por reenvíos.
  after(async () => {
    let status: "answered" | "failed" | "undelivered" = "answered";
    try {
      if (isTelegramMenuRequest(text)) {
        const sent = await sendTelegramTo(actor.chatId, TELEGRAM_ADMIN_HELP, { replyMarkup: TELEGRAM_ADMIN_MENU });
        if (!sent) status = "undelivered";
      } else {
        const reply = await runTelegramAdminAgent(actor.chatId, text);
        for (let i = 0; i < reply.length; i += 4000) {
          if (!(await sendTelegramTo(actor.chatId, reply.slice(i, i + 4000)))) status = "undelivered";
        }
      }
    } catch {
      status = "failed";
      const sent = await sendTelegramTo(actor.chatId, "No he podido completar la consulta. No se ha realizado ningún cambio. Envía un mensaje nuevo para reintentar o abre /menu.");
      if (!sent) status = "undelivered";
    } finally {
      if (status !== "answered") console.error(`[telegram-webhook] update ${update.update_id}: ${status}`);
      await finishTelegramUpdate(update.update_id, actor, status, token).catch(() => {
        console.error(`[telegram-webhook] update ${update.update_id}: no se pudo guardar el resultado`);
      });
    }
  });
  return NextResponse.json({ ok: true });
}
