/**
 * AI Quote Builder — convierte un brief cliente en texto natural en un
 * presupuesto cerrado con productos del catálogo + precios calculados.
 *
 * Caso típico de input:
 *   "Toallas microfibra serigrafiadas: 100ud
 *    Polo hombre negro con logo bordado 1 color: 20ud M, 20 L, 20 XL
 *    Polo mujer negro con logo bordado 1 color: 15 S, 15 M, 15 L"
 *
 * Output:
 *   { lines: [
 *       { productSlug, productName, productRef, technique, totalQty,
 *         variants: [{size, qty}], unitCents, totalCents, mockup },
 *     ],
 *     totalCents, currency: "EUR" }
 */

import { prisma } from "@/lib/prisma";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_QUOTE_AI || "anthropic/claude-sonnet-4.5";

export type BriefLine = {
  productHint: string;          // descripción producto buscada
  technique: string | null;     // "serigrafia", "bordado", "laser", ...
  colorHint: string | null;     // color preferido
  numberOfColours: number;      // colores del marcaje (default 1)
  variants: Array<{ size: string | null; qty: number }>;
  totalQty: number;
  notes?: string;
};

export type ParsedBrief = {
  lines: BriefLine[];
  customerCompany?: string;
  customerName?: string;
  rawBrief: string;
};

export type ParseResult = { ok: true; brief: ParsedBrief } | { ok: false; error: string };

// ─── Paso 1: parsear texto natural con IA ───────────────────────────

const SYSTEM_PARSE = `Eres un asistente que estructura briefs de clientes B2B españoles que quieren cotizar merchandising corporativo.

Recibes texto libre con varias líneas (cada una un producto distinto) y devuelves un JSON con la lista de productos solicitados.

Campos esperados por línea:
- "productHint": descripción del producto en 2-6 palabras (ej. "toalla microfibra", "polo hombre negro").
- "technique": una de "serigrafia" | "bordado" | "laser" | "dtf" | "transfer" | "sublimacion" | "tampografia" | "doming" | "vinilo" | null. Detéctala del texto ("serigrafiadas" → serigrafia, "bordado a X colores" → bordado, "grabado láser" → laser).
- "colorHint": color del producto si se menciona (ej. "negro", "blanco", "rojo"), null si no aparece.
- "numberOfColours": número de colores del MARCAJE/logo, default 1 si no se especifica. ("bordado a 2 colores" → 2; "bordado a 1 color" → 1).
- "variants": array con {size, qty}. Si menciona tallas (S, M, L, XL, XXL) las extraes. Si NO menciona tallas pero da una cantidad total única, devuelves un único variant {size: null, qty: total}.
- "totalQty": suma de qty de todas las variants.
- "notes": cualquier nota adicional relevante (urgencia, fecha límite, cliente final).

Datos cliente opcionales:
- "customerCompany": nombre empresa si lo menciona
- "customerName": persona si lo menciona

Output JSON estricto:
{
  "lines": [ ... ],
  "customerCompany": "...",
  "customerName": "..."
}

NO inventes nada que el texto no diga. Si te falta info, deja null o número 0.`;

export async function parseClientBrief(brief: string): Promise<ParseResult> {
  if (!OPENROUTER_API_KEY) {
    return { ok: false, error: "OPENROUTER_API_KEY no configurado" };
  }
  if (!brief || brief.trim().length < 10) {
    return { ok: false, error: "Brief demasiado corto" };
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://merchandising.hubstartidea.es",
        "X-Title": "TodoMerchandising AI Quote Builder",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PARSE },
          { role: "user", content: brief },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `OpenRouter ${res.status}` };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Sin contenido en respuesta" };

    let parsed: { lines?: BriefLine[]; customerCompany?: string; customerName?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return { ok: false, error: "Respuesta no es JSON" };
      parsed = JSON.parse(match[0]);
    }

    if (!parsed.lines || !Array.isArray(parsed.lines) || parsed.lines.length === 0) {
      return { ok: false, error: "No se detectaron líneas de producto" };
    }

    return {
      ok: true,
      brief: {
        lines: parsed.lines,
        customerCompany: parsed.customerCompany,
        customerName: parsed.customerName,
        rawBrief: brief,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de red" };
  }
}

// ─── Paso 2: buscar producto matching en catálogo ───────────────────

export type MatchedProduct = {
  id: string;
  slug: string;
  name: string;
  productRef: string;
  primaryImageUrl: string | null;
  category: string | null;
  material: string | null;
};

export async function matchProductByHint(
  hint: string,
  colorHint: string | null = null,
): Promise<MatchedProduct[]> {
  if (!hint) return [];

  // Tokenize: palabras >2 caracteres del hint
  const tokens = hint
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (tokens.length === 0) return [];

  // Match nombre + descripción + tags + material; agregar color hint a variants
  const candidates = await prisma.product.findMany({
    where: {
      active: true,
      NOT: { override: { is: { hidden: true } } },
      AND: tokens.map((t) => ({
        OR: [
          { name: { contains: t, mode: "insensitive" as const } },
          { shortDescription: { contains: t, mode: "insensitive" as const } },
          { material: { contains: t, mode: "insensitive" as const } },
          { tags: { has: t } },
          { category: { name: { contains: t, mode: "insensitive" as const } } },
        ],
      })),
    },
    take: 5,
    select: {
      id: true,
      slug: true,
      name: true,
      internalRef: true,
      primaryImageUrl: true,
      material: true,
      category: { select: { name: true } },
      override: { select: { customName: true } },
    },
  });

  // Si hay colorHint, priorizar productos cuya alguna variant matchee el color
  if (colorHint && candidates.length > 1) {
    const tokenColor = colorHint.toLowerCase();
    const withColor = await prisma.product.findMany({
      where: {
        id: { in: candidates.map((c) => c.id) },
        variants: {
          some: {
            OR: [
              { colorName: { contains: tokenColor, mode: "insensitive" as const } },
              { colorGroup: { contains: tokenColor, mode: "insensitive" as const } },
            ],
          },
        },
      },
      select: { id: true },
    });
    const idsWithColor = new Set(withColor.map((p) => p.id));
    candidates.sort((a, b) => (idsWithColor.has(a.id) ? -1 : idsWithColor.has(b.id) ? 1 : 0));
  }

  return candidates.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.override?.customName || c.name,
    // NUNCA supplierRef: este productRef acaba en CartQuoteItem y se muestra al
    // cliente en /clientes/[token]. Ref pública (STM-XXX) o slug.
    productRef: c.internalRef || c.slug,
    primaryImageUrl: c.primaryImageUrl,
    category: c.category?.name ?? null,
    material: c.material,
  }));
}

// ─── Paso 3: encontrar techniqueCode aplicable al producto ─────────

const TECHNIQUE_ALIASES: Record<string, string[]> = {
  serigrafia: ["serigraf", "screen", "silk"],
  bordado: ["bordad", "embroid"],
  laser: ["laser", "grabad"],
  dtf: ["dtf", "transferdig"],
  transfer: ["transfer"],
  sublimacion: ["sublim"],
  tampografia: ["tampograf", "padprint"],
  doming: ["doming", "resin"],
  vinilo: ["vinil"],
};

/**
 * Dado un producto y la técnica que pidió el cliente (normalizada),
 * encuentra el techniqueCode + positionId disponible.
 */
export async function resolveTechniqueForProduct(
  productId: string,
  techniqueNorm: string | null,
): Promise<{ techniqueCode: string; positionId: string; techniqueName: string } | null> {
  const positions = await prisma.markingPosition.findMany({
    where: { productId },
    include: {
      techniques: { include: { technique: true } },
    },
  });
  if (positions.length === 0) return null;

  // Si no hay technique especificada, devolver la primera default
  const flat = positions.flatMap((p) =>
    p.techniques.map((t) => ({
      positionId: p.positionId,
      techniqueCode: t.technique.code,
      techniqueName: t.technique.name.toLowerCase(),
      isDefault: t.isDefault,
    })),
  );

  if (!techniqueNorm) {
    const def = flat.find((f) => f.isDefault) || flat[0];
    return def
      ? { techniqueCode: def.techniqueCode, positionId: def.positionId, techniqueName: def.techniqueName }
      : null;
  }

  // Buscar por alias
  const aliases = TECHNIQUE_ALIASES[techniqueNorm] || [techniqueNorm];
  const match = flat.find((f) => aliases.some((a) => f.techniqueName.includes(a)));
  return match
    ? { techniqueCode: match.techniqueCode, positionId: match.positionId, techniqueName: match.techniqueName }
    : null;
}
