import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { VoiceSessionEndSchema, type VoiceSessionEnd } from "@/lib/voice-session-end-schema";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Cliente notifica cierre de sesión (timeout/usuario cierra widget).
 * Persistimos duración para tracking de coste + tools llamadas + transcripción,
 * y avisamos al equipo por Telegram con la conversación completa.
 *
 * Sin auth fuerte: el voice_session_id ya es opaco (cuid). Anti-abuso:
 * rate-limit por IP + solo el PRIMER cierre de cada sesión notifica (una
 * sesión ya cerrada no puede reusarse para spamear Telegram).
 */
export async function POST(req: Request) {
  const rl = rateLimit(req, { key: "voice-session-end", max: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rl.response;

  const body = await req.json().catch(() => ({}));
  const parsed = VoiceSessionEndSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const d = parsed.data;

  const existing = await prisma.voiceSession.findUnique({
    where: { id: d.voice_session_id },
    select: { id: true, endedAt: true, sourceUrl: true },
  });
  if (!existing) return NextResponse.json({ ok: true });
  // Una sesión ya cerrada es inmutable: ni re-notifica ni sobrescribe la
  // transcripción/duración guardadas (el endpoint es público).
  if (existing.endedAt) return NextResponse.json({ ok: true });

  // Coste estimado ElevenLabs Conversational AI: ~$0.08/min ≈ 0,074€ ≈ 7,4 cents/min
  const costCents = Math.round((d.duration_sec / 60) * 7.4);

  await prisma.voiceSession
    .update({
      where: { id: d.voice_session_id },
      data: {
        endedAt: new Date(),
        durationSec: d.duration_sec,
        estimatedCostCents: costCents,
        elevenLabsConversationId: d.elevenlabs_conversation_id || null,
        toolsCalled: d.tools_called as never,
        transcript: (d.transcript as never) ?? undefined,
        productSlugsDiscussed: d.product_slugs_discussed || [],
      },
    })
    .catch(() => {}); // p. ej. conversationId duplicado: no bloquea la notificación

  // Fire-and-forget: el widget suele cerrar la pestaña justo después.
  void notifyTranscript(d, existing.sourceUrl).catch((e) =>
    console.error("[session-end] telegram:", e instanceof Error ? e.message : e),
  );

  return NextResponse.json({ ok: true });
}

type Msg = { role: "user" | "agent"; text: string };

/** La API de ElevenLabs tiene la transcripción canónica (ambos lados, ASR final). */
async function fetchElevenLabsTranscript(conversationId: string): Promise<Msg[]> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [];
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { "xi-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { transcript?: Array<{ role?: string; message?: string | null }> };
    return (j.transcript || [])
      .filter((t) => typeof t.message === "string" && t.message.trim().length > 0)
      .map((t) => ({
        role: t.role === "user" ? ("user" as const) : ("agent" as const),
        text: String(t.message).slice(0, 4000),
      }));
  } catch {
    return [];
  }
}

async function notifyTranscript(d: VoiceSessionEnd, sourceUrl: string | null) {
  let transcript: Msg[] = [];
  let source = "widget";
  if (d.elevenlabs_conversation_id) {
    transcript = await fetchElevenLabsTranscript(d.elevenlabs_conversation_id);
    if (transcript.length > 0) source = "elevenlabs";
  }
  if (transcript.length === 0) transcript = d.transcript || [];
  // Sin mensajes = abrió y cerró sin hablar: el aviso de inicio ya salió, no
  // hace falta un segundo mensaje vacío.
  if (transcript.length === 0) return;

  const page = (() => {
    if (!sourceUrl) return null;
    try {
      return new URL(sourceUrl).pathname;
    } catch {
      return null;
    }
  })();
  const mins = Math.floor(d.duration_sec / 60);
  const tools = (d.tools_called || []).map((t) => t.tool);
  const header =
    `🎙️ <b>Conversación con David terminada</b> — ${mins}m ${d.duration_sec % 60}s` +
    (page ? `\n📍 ${escapeTgHtml(page)}` : "") +
    (tools.length ? `\n🔧 ${escapeTgHtml([...new Set(tools)].join(", "))}` : "") +
    (d.product_slugs_discussed?.length ? `\n📦 ${escapeTgHtml(d.product_slugs_discussed.join(", "))}` : "") +
    `\n\n📝 <b>Transcripción</b>${source === "widget" ? " (del widget)" : ""}:`;

  // Telegram limita a 4096 chars/mensaje: troceamos con techo anti-spam.
  const MAX_CHUNK = 3800;
  const MAX_CHUNKS = 5;
  const chunks: string[] = [];
  let current = header;
  for (const m of transcript) {
    const line = `${m.role === "user" ? "👤" : "💬"} ${escapeTgHtml(m.text)}`;
    if (current.length + line.length + 1 > MAX_CHUNK) {
      chunks.push(current);
      current = line;
      if (chunks.length >= MAX_CHUNKS) break;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (chunks.length < MAX_CHUNKS) {
    if (current) chunks.push(current);
  } else {
    chunks[MAX_CHUNKS - 1] += "\n<i>… (transcripción recortada)</i>";
  }
  for (const chunk of chunks) {
    await notifyTelegram(chunk);
  }
}
