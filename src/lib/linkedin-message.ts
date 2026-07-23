const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL =
  process.env.OPENROUTER_MODEL_OUTBOUND || process.env.OPENROUTER_MODEL_COPY || "anthropic/claude-sonnet-4.5";

export type LinkedInMessages = {
  connectionNote: string; // nota de la solicitud de conexión (máx 300 chars)
  firstMessage: string; // primer mensaje tras aceptar conexión
  followUp: string; // seguimiento si no responde (a los ~5 días)
};

/**
 * Genera con IA mensajes de LinkedIn personalizados para un lead. NO envía
 * nada (LinkedIn no se automatiza — ToS): devuelve el texto para que el admin
 * lo copie y pegue manualmente. Sin pie legal (no es email comercial masivo;
 * es comunicación 1-a-1 dentro de LinkedIn).
 */
export async function generateLinkedInMessages(lead: {
  name: string;
  company: string | null;
  role: string | null;
  segment: string | null;
}): Promise<{ ok: true; messages: LinkedInMessages } | { ok: false; error: string }> {
  if (!OPENROUTER_API_KEY) return { ok: false, error: "OPENROUTER_API_KEY no configurado" };

  const system = `Eres Mario Barrón, CEO de Startidea (agencia de innovación social, Granada). TodoMerchandising es vuestra LÍNEA DE MERCHANDISING: merchandising personalizado (textil, banderas, regalos de empresa) producido en Centros Especiales de Empleo, con precio competitivo, cotización al instante y empleo para personas con discapacidad en Granada.

Escribes mensajes de LinkedIn de prospección B2B en español, en PRIMERA PERSONA (tú eres Mario), humanos y cercanos, NADA agresivos ni de venta dura. Tono de tú. Honesto, breve, con un punto de propósito social sin sonar moralista.

Devuelve JSON con EXACTAMENTE estas claves:
- "connectionNote": nota para la solicitud de conexión. MÁXIMO 280 caracteres (límite de LinkedIn 300, deja margen). Personal, motiva por qué conectas. SIN pedir nada todavía.
- "firstMessage": primer mensaje tras aceptar la conexión. 2-4 frases. Presenta brevemente el valor y una pregunta abierta suave (no "¿te interesa comprar?").
- "followUp": seguimiento amable si no responde en ~5 días. 1-2 frases, sin presionar, fácil de decir que no.

Nada de emojis excesivos (máximo 1 y solo si encaja). No inventes datos del destinatario.`;

  const user = `Lead de LinkedIn:
- Nombre: ${lead.name}
- Empresa: ${lead.company || "(desconocida)"}
- Cargo: ${lead.role || "(desconocido)"}
- Sector/segmento: ${lead.segment || "(desconocido)"}

Genera los 3 mensajes. Personaliza con empresa/sector si los hay; si no, mantén honesto y genérico.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": SITE_URL,
        "X-Title": "TodoMerchandising LinkedIn Assistant",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.85,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `OpenRouter HTTP ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Respuesta IA vacía" };
    let parsed: Partial<LinkedInMessages>;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      parsed = m ? JSON.parse(m[1]) : {};
    }
    const connectionNote = String(parsed.connectionNote || "").trim().slice(0, 300);
    const firstMessage = String(parsed.firstMessage || "").trim();
    const followUp = String(parsed.followUp || "").trim();
    if (!connectionNote || !firstMessage) {
      return { ok: false, error: "IA no devolvió mensajes válidos" };
    }
    return { ok: true, messages: { connectionNote, firstMessage, followUp } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
