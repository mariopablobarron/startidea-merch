/**
 * Content Studio — generador de copy con IA anclado al Manual de
 * identidad Startidea v1.0 (mayo 2026).
 *
 * Llama a OpenRouter (Claude Sonnet 4.5 por defecto, configurable).
 * Devuelve 3 variaciones por pieza para que el admin elija.
 *
 * Tono fijo: "directos, atentos, sin disfraz de agencia. La frase corta gana."
 */

import type { ContentChannel, ContentType } from "@prisma/client";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_COPY || "anthropic/claude-sonnet-4.5";

export type GenerateBriefInput = {
  type: ContentType;
  channel: ContentChannel;
  topic: string;             // tema / objetivo principal de la pieza
  productName?: string;      // si va asociado a producto
  productPrice?: string;     // ej "1,80 €/ud"
  sector?: string;           // sector de la audiencia (RRHH, marketing, eventos)
  cta?: string;              // call-to-action específico
  customInstructions?: string; // briefing extra del admin
};

export type GeneratedVariation = {
  id: string;
  copy: string;
  hashtags: string[];
  notes?: string;
};

export type GenerateResult = {
  ok: true;
  variations: GeneratedVariation[];
  model: string;
};

export type GenerateError = { ok: false; error: string };

// ─── Brand voice extraído del Manual Startidea v1.0 ───────────────────────
const BRAND_VOICE_SYSTEM = `
Eres copywriter de Startidea, consultora de marketing y comunicación con sede en Granada. La sub-marca TodoMerchandising vende merchandising corporativo personalizado B2B con producción en Centros Especiales de Empleo (CEE) — impacto social real.

MANUAL DE TONO (V1.0, mayo 2026):

— Hablamos como hablaríamos a un cliente en la oficina: directos, atentos, sin disfraz de agencia.
— La frase corta gana.
— Damos forma a ideas que ya estaban ahí, esperando ser contadas.

SÍ decimos:
• "Te ayudamos a contar lo que haces"
• "Marketing con cabeza para proyectos con sentido"
• "Una idea no se vende sola. Se cuenta bien"
• "Estrategia primero. Después, lo bonito"
• "Cotización en 24h"
• "Producción que cambia vidas" (referente CEE)

NO decimos (jerga prohibida):
• "Soluciones integrales 360º"
• "Sinergias disruptivas"
• "Potenciamos tu marca al siguiente nivel"
• "Storytelling de impacto"
• "Branding emocional"
• "Equipo de profesionales altamente cualificados"

REGLAS DE COPY:
1. Sin exclamaciones gratuitas ni mayúsculas enteras.
2. Sin emojis decorativos. Solo emojis funcionales si suman información.
3. Cifras concretas (€/ud, % impacto, días entrega) en vez de adjetivos vagos.
4. Verbo en activa, sujeto explícito cuando aporta.
5. CTA único por pieza.
6. Si mencionas CEE: clarifica brevemente ("Centros Especiales de Empleo, empresas con >70% plantilla con discapacidad").
`.trim();

// ─── Especificaciones por tipo/canal ───────────────────────────────────────
function channelSpec(type: ContentType, channel: ContentChannel): string {
  const specs: Record<string, string> = {
    "POST-IG":
      "Post Instagram feed. Máx 180-220 caracteres. 1 frase gancho, 1 frase explicativa, CTA. Hashtags al final (5-8).",
    "POST-LINKEDIN":
      "Post LinkedIn. 600-1200 caracteres. Empieza con un dato o una pregunta. 3-4 párrafos cortos. CTA suave. Hashtags 3-5 al final. Sin emojis decorativos.",
    "POST-FB":
      "Post Facebook. 150-250 caracteres. Tono conversacional. CTA con link.",
    "POST-X":
      "Tweet. Máx 270 caracteres. Frase única. 1-2 hashtags si encajan.",
    STORY:
      "Story 9:16. Texto sobre imagen. Máx 60 caracteres por pantalla. Cuenta historia en 3-5 pantallas.",
    REEL:
      "Guion para Reel/TikTok. 15-30 segundos. Hook en primer segundo. 3-5 frases cortas que dirán los rótulos sobre cada plano.",
    CARRUSEL:
      "Carrusel 6-8 slides. Slide 1 hook. Slides 2-6 contenido (1 idea por slide, 15-30 palabras). Slide final CTA.",
    EMAIL:
      "Email broadcast. Asunto (≤50 char) + preheader (≤90 char) + cuerpo HTML simple. Cuerpo: 100-200 palabras, párrafos cortos, 1 CTA primario.",
    BLOG:
      "Artículo SEO largo. 1500-2500 palabras. H1 con keyword. Intro 80 palabras. 4-6 H2. Listas y ejemplos concretos. FAQ al final (3-5 preguntas).",
    AD:
      "Creatividad de anuncio pagado. Headline (≤40 char) + descripción (≤90 char) + CTA. 2-3 variaciones para A/B.",
    LANDING:
      "Copy para landing dedicada. H1 (≤10 palabras) + sub-H1 + 3 bullets de beneficios + form CTA.",
  };
  return specs[`${type}-${channel}`] || specs[type] || specs.POST;
}

// ─── Llamada a OpenRouter ──────────────────────────────────────────────────
export async function generateCopy(
  input: GenerateBriefInput,
): Promise<GenerateResult | GenerateError> {
  if (!OPENROUTER_API_KEY) {
    return { ok: false, error: "OPENROUTER_API_KEY no configurado" };
  }

  const spec = channelSpec(input.type, input.channel);
  const productBlock = input.productName
    ? `\nPRODUCTO: ${input.productName}${input.productPrice ? ` · ${input.productPrice}` : ""}`
    : "";
  const sectorBlock = input.sector ? `\nSECTOR AUDIENCIA: ${input.sector}` : "";
  const ctaBlock = input.cta ? `\nCTA OBLIGATORIO: ${input.cta}` : "";
  const extraBlock = input.customInstructions
    ? `\nINSTRUCCIONES EXTRA: ${input.customInstructions}`
    : "";

  const userPrompt = `
GENERA 3 variaciones de copy para una pieza ${input.type} en ${input.channel}.

TEMA: ${input.topic}${productBlock}${sectorBlock}${ctaBlock}${extraBlock}

ESPECIFICACIÓN DEL CANAL:
${spec}

DEVUELVE JSON estricto sin texto adicional. Formato:
{
  "variations": [
    { "id": "v1", "copy": "...", "hashtags": ["..."], "notes": "..." },
    { "id": "v2", "copy": "...", "hashtags": ["..."], "notes": "..." },
    { "id": "v3", "copy": "...", "hashtags": ["..."], "notes": "..." }
  ]
}

Notes (opcional, max 15 palabras): por qué esta variación.
`.trim();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://merchandising.startidea.es",
        "X-Title": "TodoMerchandising Content Studio",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: BRAND_VOICE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `OpenRouter HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Respuesta IA vacía" };

    let parsed: { variations?: GeneratedVariation[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      // Algunos modelos envuelven en ```json
      const match = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      parsed = match ? JSON.parse(match[1]) : {};
    }

    const variations = (parsed.variations || []).slice(0, 3).map((v, i) => ({
      id: v.id || `v${i + 1}`,
      copy: String(v.copy || "").trim(),
      hashtags: Array.isArray(v.hashtags)
        ? v.hashtags.map((h: unknown) => String(h).replace(/^#/, "")).slice(0, 10)
        : [],
      notes: v.notes ? String(v.notes).slice(0, 200) : undefined,
    }));

    if (variations.length === 0) {
      return { ok: false, error: "Sin variaciones válidas en respuesta IA" };
    }

    return { ok: true, variations, model: MODEL };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error llamando a OpenRouter",
    };
  }
}

/**
 * Genera UTM `utm_content` único basado en piece id + timestamp.
 * Para tracking de atribución por pieza individual.
 */
export function buildUtmContent(pieceId: string): string {
  return `pc-${pieceId.slice(0, 8)}`;
}

/**
 * Genera slug UTM de campaña a partir de su nombre.
 *   "Black Friday 2026" → "black-friday-2026"
 */
export function campaignSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
