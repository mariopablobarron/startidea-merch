import { timingSafeEqual } from "node:crypto";

/**
 * Las tools del agente las llama ElevenLabs Cloud desde sus servidores —
 * no el navegador del usuario. Para evitar que cualquiera pueda invocar
 * /api/voice-agent/tools/* directamente (y, p.ej., spam de submit-quote),
 * cada tool exige un header X-Voice-Agent-Secret que coincida con
 * VOICE_AGENT_TOOL_SECRET (env).
 *
 * En la config del Agent en ElevenLabs, cada tool se define con este
 * header en su sección "Headers". El secret no sale del backend.
 */
export function requireVoiceAgentToolSecret(
  req: Request,
): { ok: true } | { ok: false; status: number; reason: string } {
  const secret = process.env.VOICE_AGENT_TOOL_SECRET;
  if (!secret)
    return { ok: false, status: 503, reason: "VOICE_AGENT_TOOL_SECRET no configurado" };

  const provided = req.headers.get("x-voice-agent-secret") || "";
  if (!provided) return { ok: false, status: 401, reason: "missing secret" };

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return { ok: false, status: 403, reason: "bad secret" };
  if (!timingSafeEqual(a, b)) return { ok: false, status: 403, reason: "bad secret" };
  return { ok: true };
}
