/**
 * Generador de descripciones de producto con IA.
 * Para fichas con shortDescription/longDescription pobres o vacías.
 *
 * Output anclado al Manual de identidad Startidea v1.0:
 *  - Tono directo B2B, sin jerga
 *  - Estructura útil para usuario novato en merchandising
 *  - Incluye casos de uso reales (eventos, regalo corporativo, kit bienvenida)
 *  - Sugiere técnica de marcaje compatible cuando aplica
 *
 * Modelo: Haiku por defecto (cheap), Sonnet si se quiere calidad alta.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_DESCRIPTIONS || "anthropic/claude-haiku-4.5";

export type ProductInput = {
  name: string;
  category?: string | null;
  material?: string | null;
  shortDescriptionExisting?: string | null;
  longDescriptionExisting?: string | null;
  tags?: string[];
  variants?: Array<{ colorName?: string | null; size?: string | null }>;
  markingPositions?: Array<{ positionId: string; techniques: string[] }>;
};

export type ProductDescriptionResult =
  | { ok: true; shortDescription: string; longDescription: string; model: string }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `Eres copywriter B2B de TodoMerchandising — sub-marca de Startidea (consultora de marketing en Granada) que vende merchandising corporativo personalizado producido en Centros Especiales de Empleo y talleres locales certificados.

TONO (Manual Startidea v1.0):
- Directo, sin jerga publicitaria. Frase corta gana.
- Verbo en activa. Sujeto explícito cuando aporta.
- Cifras y especificaciones técnicas concretas en vez de adjetivos vagos.
- Cero clichés: nada de "solución perfecta", "increíble experiencia", "potencia tu marca", "calidad premium" sin sustento, "lleva tu evento al siguiente nivel".
- Cero emojis decorativos en el texto.

CONTEXTO USUARIO:
Lector típico = persona de RRHH o Marketing en empresa española de 20-500 empleados, encargada de comprar merch para evento / regalo / kit bienvenida. No es experto en producción gráfica. Necesita entender QUÉ es el producto y POR QUÉ encaja en su uso.

FORMATO OUTPUT estricto JSON:
{
  "shortDescription": "1 frase 80-140 caracteres. Resume QUÉ es y para qué",
  "longDescription": "3-4 párrafos Markdown sin H1/H2 (ya van como sub-elementos). Estructura: párrafo 1 = descripción material+características técnicas; párrafo 2 = casos de uso típicos B2B; párrafo 3 = marcaje recomendado (técnica adecuada según material). 200-350 palabras totales. NO repitas el nombre del producto en cada párrafo."
}

NO inventes datos. Si te falta info (gramaje, capacidad, dimensiones), usa rangos típicos del tipo de producto pero no afirmes valores específicos como si los conocieras.

Cierra el JSON sin texto extra antes o después.`;

export async function generateProductDescription(
  product: ProductInput,
): Promise<ProductDescriptionResult> {
  if (!OPENROUTER_API_KEY) {
    return { ok: false, error: "OPENROUTER_API_KEY no configurado" };
  }

  const userPrompt = buildUserPrompt(product);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://merchandising.startidea.es",
        "X-Title": "TodoMerchandising product description generator",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `OpenRouter ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, error: "OpenRouter sin contenido en respuesta" };
    }

    let parsed: { shortDescription?: string; longDescription?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      // Intento extraer JSON de un bloque de código si el modelo añadió texto
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false, error: "Respuesta no es JSON parseable" };
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.shortDescription || !parsed.longDescription) {
      return { ok: false, error: "Faltan campos shortDescription o longDescription" };
    }

    return {
      ok: true,
      shortDescription: parsed.shortDescription.trim().slice(0, 240),
      longDescription: parsed.longDescription.trim().slice(0, 4000),
      model: MODEL,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de red" };
  }
}

function buildUserPrompt(p: ProductInput): string {
  const parts: string[] = [`PRODUCTO: ${p.name}`];
  if (p.category) parts.push(`CATEGORÍA: ${p.category}`);
  if (p.material) parts.push(`MATERIAL: ${p.material}`);
  if (p.tags && p.tags.length > 0) parts.push(`TAGS: ${p.tags.join(", ")}`);
  if (p.shortDescriptionExisting) {
    parts.push(`DESCRIPCIÓN ACTUAL CORTA (pobre, mejorar): ${p.shortDescriptionExisting}`);
  }
  if (p.longDescriptionExisting) {
    parts.push(
      `DESCRIPCIÓN ACTUAL LARGA (pobre, mejorar): ${p.longDescriptionExisting.slice(0, 800)}`,
    );
  }
  if (p.variants && p.variants.length > 0) {
    const colors = Array.from(
      new Set(p.variants.map((v) => v.colorName).filter((c): c is string => !!c)),
    ).slice(0, 8);
    const sizes = Array.from(
      new Set(p.variants.map((v) => v.size).filter((s): s is string => !!s)),
    ).slice(0, 8);
    if (colors.length > 0) parts.push(`COLORES DISPONIBLES: ${colors.join(", ")}`);
    if (sizes.length > 0) parts.push(`TALLAS DISPONIBLES: ${sizes.join(", ")}`);
  }
  if (p.markingPositions && p.markingPositions.length > 0) {
    parts.push(
      `ZONAS DE MARCAJE: ${p.markingPositions
        .map((mp) => `${mp.positionId} (${mp.techniques.join("/")})`)
        .join("; ")}`,
    );
  }
  parts.push("");
  parts.push(
    "Genera shortDescription y longDescription en español de España, JSON estricto.",
  );
  return parts.join("\n");
}
