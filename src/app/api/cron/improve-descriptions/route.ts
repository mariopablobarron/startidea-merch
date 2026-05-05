import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Mejora descripciones genéricas del catálogo MidOcean usando IA.
 *
 * Procesa N productos por llamada (default 30) que aún no tienen
 * `enhancedShortDescription`. Para cada uno, pide a OpenRouter una
 * descripción comercial en español de 1-2 frases, basada en:
 *   - Nombre del producto
 *   - Descripción corta original (a veces sólo dice dimensiones)
 *   - Descripción larga si existe
 *   - Material y categoría
 *
 * Disparado externamente por cron-job.org cada noche o manualmente.
 */

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_FAST || "anthropic/claude-haiku-4.5";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (!OPENROUTER_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY no configurada" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const batchSize = Math.min(50, parseInt(url.searchParams.get("batch") || "30", 10) || 30);

  // Productos sin enhanced — preferimos los que tienen menos info original
  const candidates = await prisma.product.findMany({
    where: { active: true, enhancedShortDescription: null },
    take: batchSize,
    orderBy: [{ syncedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      shortDescription: true,
      longDescription: true,
      material: true,
      category: { select: { name: true } },
    },
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "Nada que mejorar." });
  }

  const startedAt = new Date();
  let updated = 0;
  const errors: Array<{ slug: string; message: string }> = [];

  // Procesamos en serie con pequeño delay para no saturar OpenRouter
  for (const p of candidates) {
    try {
      const desc = await generateDescription({
        name: p.name,
        category: p.category?.name,
        material: p.material,
        shortDescription: p.shortDescription,
        longDescription: p.longDescription,
      });
      if (desc) {
        await prisma.product.update({
          where: { id: p.id },
          data: { enhancedShortDescription: desc, enhancedAt: new Date() },
        });
        updated++;
      }
    } catch (err) {
      errors.push({ slug: p.slug, message: err instanceof Error ? err.message : String(err) });
    }
    // Throttle suave para no agotar rate limit
    await new Promise((r) => setTimeout(r, 150));
  }

  return NextResponse.json({
    ok: true,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    processed: candidates.length,
    updated,
    errors: errors.slice(0, 20),
    model: MODEL,
  });
}

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [total, withEnhanced] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.product.count({ where: { active: true, enhancedShortDescription: { not: null } } }),
  ]);
  return NextResponse.json({
    ok: true,
    total,
    withEnhanced,
    pending: total - withEnhanced,
    coveragePercent: total > 0 ? Math.round((withEnhanced / total) * 100) : 0,
  });
}

async function generateDescription(input: {
  name: string;
  category?: string | null;
  material?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
}): Promise<string | null> {
  const prompt = `Eres un copy comercial B2B en español de España (tuteo, directo, sin marketing vacío).

Producto: ${input.name}
Categoría: ${input.category || "—"}
Material: ${input.material || "—"}
Descripción original corta: "${input.shortDescription || "—"}"
${input.longDescription ? `Descripción original larga: "${input.longDescription.slice(0, 400)}"` : ""}

Devuelve UNA sola descripción comercial de 1-2 frases (máx 180 caracteres) que:
1. Diga claramente qué es el producto y para qué sirve.
2. Mencione 1 ventaja diferencial real (no genérica).
3. Termine con orientación de uso comercial: "Ideal para X" o "Perfecto para Y".

Devuelve SOLO el texto plano de la descripción, sin comillas, sin markdown, sin prefijos tipo "Descripción:".`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SITE_URL,
      "X-Title": "TodoMerchandising · descriptions improver",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 150,
      temperature: 0.6,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content?.trim() || "";
  // Limpieza: quitar comillas, prefijos comunes
  const cleaned = text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^Descripci[óo]n:\s*/i, "")
    .trim();

  if (!cleaned || cleaned.length < 20 || cleaned.length > 250) return null;
  return cleaned;
}
