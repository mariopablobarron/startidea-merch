import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Devuelve una signed URL para iniciar conversación con el agente ElevenLabs.
 * El cliente la usa con `useConversation()` de @elevenlabs/react.
 *
 * También crea una fila VoiceSession para tracking (la cerramos vía
 * /api/voice-agent/session-end cuando termina).
 *
 * Anti-abuso:
 *  - Rate limit 5 conversaciones / 15 min por IP
 *  - El propio plan de ElevenLabs limita minutos / mes
 *  - Si se detecta abuso real, añadir captcha o limitar a usuarios con email
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

export async function GET(req: Request) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
    return NextResponse.json(
      {
        error:
          "Agente de voz no configurado (ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID ausentes en server)",
      },
      { status: 503 },
    );
  }

  // Anti-abuso por IP
  const rl = rateLimit(req, { key: "voice-agent-init", max: 5, windowMs: 15 * 60_000 });
  if (!rl.ok) return rl.response;

  // Pide signed URL a ElevenLabs
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(ELEVENLABS_AGENT_ID)}`;

  let signedUrl = "";
  try {
    const r = await fetch(url, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      cache: "no-store",
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `ElevenLabs error HTTP ${r.status}`, detail: txt.slice(0, 300) },
        { status: 502 },
      );
    }
    const j = await r.json();
    signedUrl = j.signed_url;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch ElevenLabs failed" },
      { status: 502 },
    );
  }

  if (!signedUrl) {
    return NextResponse.json({ error: "ElevenLabs no devolvió signed_url" }, { status: 502 });
  }

  // Crear VoiceSession para tracking. Aún sin elevenLabsConversationId
  // (el cliente lo asociará cuando recibe el evento `onConnect`).
  const ua = req.headers.get("user-agent")?.slice(0, 240) || null;
  const referer = req.headers.get("referer")?.slice(0, 500) || null;
  const session = await prisma.voiceSession.create({
    data: { userAgent: ua, sourceUrl: referer },
  });

  return NextResponse.json({
    signedUrl,
    voiceSessionId: session.id,
    agentName: process.env.ELEVENLABS_AGENT_NAME || "Diego",
  });
}
