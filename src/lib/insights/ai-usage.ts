/**
 * Stats de uso de OpenRouter agregadas desde RecommenderQuery.
 *
 * El esquema RecommenderQuery ya tiene modelUsed, promptTokens,
 * completionTokens y mode — basta con leer y agregar. Sin migración.
 *
 * Tarifas: hardcoded desde openrouter.ai/models (junio 2026).
 * Si OpenRouter cambia tarifas, actualizar PRICING_USD_PER_M.
 */
import { prisma } from "@/lib/prisma";

// Precio en USD por 1M tokens (input, output). Junio 2026.
// Ver https://openrouter.ai/models para tarifas actualizadas.
const PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  "anthropic/claude-opus-4.7": { input: 15, output: 75 },
  "anthropic/claude-opus-4.1": { input: 15, output: 75 },
  "anthropic/claude-sonnet-4.5": { input: 3, output: 15 },
  "anthropic/claude-sonnet-4": { input: 3, output: 15 },
  "anthropic/claude-haiku-4.5": { input: 0.8, output: 4 },
  "openai/gpt-5": { input: 5, output: 20 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "google/gemini-2.5-pro": { input: 2, output: 10 },
};

// Conversión USD → EUR aproximada (refrescar trimestralmente o leer de API
// si se vuelve crítico). Junio 2026.
const USD_TO_EUR = 0.93;

function estimateCostEur(
  model: string | null,
  promptTokens: number,
  completionTokens: number,
): number {
  if (!model) return 0;
  // Tolerancia para variantes del nombre (ej. con versión completa)
  const key =
    PRICING_USD_PER_M[model] ||
    PRICING_USD_PER_M[model.split(":")[0]] ||
    null;
  if (!key) return 0;
  const usd =
    (promptTokens / 1_000_000) * (key as { input: number; output: number }).input +
    (completionTokens / 1_000_000) * (key as { input: number; output: number }).output;
  return usd * USD_TO_EUR;
}

export type AiUsageByModel = {
  modelUsed: string;
  count: number;
  promptTokens: number;
  completionTokens: number;
  costEur: number;
};

export type AiUsageStats = {
  windowDays: number;
  totalQueries: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostEur: number;
  byModel: AiUsageByModel[];
  byMode: { mode: string; count: number; costEur: number }[];
  // Sin date-fns: agrupación por día YYYY-MM-DD en JS para evitar dependencia
  byDay: { day: string; count: number; tokens: number; costEur: number }[];
};

export async function getAiUsageStats(days = 30): Promise<AiUsageStats> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await prisma.recommenderQuery.findMany({
    where: { createdAt: { gte: since } },
    select: {
      createdAt: true,
      modelUsed: true,
      promptTokens: true,
      completionTokens: true,
      mode: true,
    },
  });

  const byModelMap = new Map<string, AiUsageByModel>();
  const byModeMap = new Map<string, { count: number; costEur: number }>();
  const byDayMap = new Map<
    string,
    { count: number; tokens: number; costEur: number }
  >();

  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalCost = 0;

  for (const r of rows) {
    const model = r.modelUsed || "unknown";
    const prompt = r.promptTokens ?? 0;
    const completion = r.completionTokens ?? 0;
    const cost = estimateCostEur(r.modelUsed, prompt, completion);
    const mode = r.mode || "unknown";
    const day = r.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD

    totalPrompt += prompt;
    totalCompletion += completion;
    totalCost += cost;

    const m = byModelMap.get(model) ?? {
      modelUsed: model,
      count: 0,
      promptTokens: 0,
      completionTokens: 0,
      costEur: 0,
    };
    m.count++;
    m.promptTokens += prompt;
    m.completionTokens += completion;
    m.costEur += cost;
    byModelMap.set(model, m);

    const md = byModeMap.get(mode) ?? { count: 0, costEur: 0 };
    md.count++;
    md.costEur += cost;
    byModeMap.set(mode, md);

    const d = byDayMap.get(day) ?? { count: 0, tokens: 0, costEur: 0 };
    d.count++;
    d.tokens += prompt + completion;
    d.costEur += cost;
    byDayMap.set(day, d);
  }

  return {
    windowDays: days,
    totalQueries: rows.length,
    totalPromptTokens: totalPrompt,
    totalCompletionTokens: totalCompletion,
    totalCostEur: totalCost,
    byModel: Array.from(byModelMap.values()).sort(
      (a, b) => b.costEur - a.costEur,
    ),
    byMode: Array.from(byModeMap.entries())
      .map(([mode, v]) => ({ mode, ...v }))
      .sort((a, b) => b.costEur - a.costEur),
    byDay: Array.from(byDayMap.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// Export para tests
export { estimateCostEur, PRICING_USD_PER_M, USD_TO_EUR };
