/**
 * Extrae JSON de respuestas de modelos IA aunque vengan envueltos en
 * markdown o con texto explicativo antes/después.
 *
 * Casos tolerados (en orden de prioridad):
 *   1. JSON puro                                          → tal cual
 *   2. ```json\n{...}\n```  (markdown code fence)         → strip wrapper
 *   3. ```\n{...}\n```      (sin lang)                    → strip wrapper
 *   4. "Aquí está el JSON: {...}"  (texto + JSON inline)  → balance braces
 *
 * Si nada funciona, devuelve el original tal cual y que JSON.parse falle
 * de forma legible aguas arriba.
 *
 * Usado por /api/admin/proposals/generate y /api/recommend.
 */
export function extractJsonFromAIResponse(text: string): string {
  if (!text) return text;
  const trimmed = text.trim();

  // Caso 1: ya empieza por { y termina por } — probablemente JSON puro
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  // Caso 2-3: markdown code fence
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Casos 4-5: extraer estructura outer-most JSON ({...} u [...]).
  // Tomamos lo que aparezca PRIMERO en el texto — si un array empieza
  // antes que cualquier { suelto (típico cuando JSON top-level es array),
  // arrancamos por ahí y cerramos en su último ] correspondiente.
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");

  const useArray =
    firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);
  const useObject =
    firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);

  if (useArray) {
    const lastBracket = trimmed.lastIndexOf("]");
    if (lastBracket > firstBracket) return trimmed.slice(firstBracket, lastBracket + 1);
  }
  if (useObject) {
    const lastBrace = trimmed.lastIndexOf("}");
    if (lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}
