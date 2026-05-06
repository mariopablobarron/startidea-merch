/**
 * Notificaciones a chat de Telegram del equipo.
 * Reusa TELEGRAM_BOT_TOKEN ya configurado para backups.
 *
 * Si TELEGRAM_TEAM_CHAT_ID no está, no manda nada (silencioso).
 * Para grupos privados, el chat_id empieza por "-".
 */

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

export async function notifyTelegram(text: string, opts?: { parseMode?: "HTML" | "MarkdownV2" }): Promise<boolean> {
  if (!BOT || !CHAT) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT,
        text,
        parse_mode: opts?.parseMode || "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("[telegram]", err);
    return false;
  }
}

export function isTelegramConfigured(): boolean {
  return !!(BOT && CHAT);
}
