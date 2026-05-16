/**
 * Convierte los códigos crudos de zona de marcaje (ej. "FRONT DO DL",
 * "TOP COMPASS", "UPPER MIDDLE", "ROUNDSCREEN") en etiquetas legibles
 * para el cliente.
 *
 * Los códigos vienen del feed del proveedor en inglés/portugués mezclado
 * con jerga técnica. El cliente final no debería ver "FRONT DO DL" en un
 * dropdown — queda críptico y delata el origen del feed.
 *
 * Mapping ordenado por especificidad (frase completa antes que palabras
 * sueltas). Si no hay match, devuelve el código capitalizado limpio.
 */

const EXACT_MATCHES: Record<string, string> = {
  // Botellas / drinkware
  ROUNDSCREEN: "Lateral · serigrafía rotativa",
  "ROUND SCREEN": "Lateral · serigrafía rotativa",
  ROUNDDIGITAL: "Lateral · digital 360°",
  "ROUND DIGITAL": "Lateral · digital 360°",
  ROUNDLASER: "Lateral · grabado láser",
  "ROUND LASER": "Lateral · grabado láser",
  SUBLIMATION: "Sublimación",
  // Cajas / packaging
  "TOP BOX": "Tapa",
  "TOP COMPASS": "Tapa central",
  "BOTTOM BOX": "Base",
  "FRONT BOX": "Frontal",
  "BACK BOX": "Trasera",
  "INSIDE BOX": "Interior",
  // Textil
  "UPPER MIDDLE": "Centro pecho",
  "LOWER MIDDLE": "Centro bajo",
  "LEFT CHEST": "Pecho izquierdo",
  "RIGHT CHEST": "Pecho derecho",
  "FULL FRONT": "Frente completo",
  "FULL BACK": "Espalda completa",
  "LEFT SLEEVE": "Manga izquierda",
  "RIGHT SLEEVE": "Manga derecha",
  // Genéricos
  FRONT: "Frontal",
  BACK: "Trasera",
  TOP: "Superior",
  BOTTOM: "Inferior",
  LEFT: "Izquierda",
  RIGHT: "Derecha",
  CENTER: "Centro",
  // Códigos numéricos (algunos proveedores)
  "360": "360° (todo el contorno)",
};

const TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  // Patrones tipo "FRONT DO DL" → quitar "DO XX"
  [/\s+DO\s+[A-Z0-9]+/g, ""],
  [/\s+DA\s+[A-Z0-9]+/g, ""],
  // Acrónimos largos a expandir
  [/\bDL\b/g, "izquierda"],
  [/\bDR\b/g, "derecha"],
  [/\bUL\b/g, "superior izquierda"],
  [/\bUR\b/g, "superior derecha"],
  [/\bBL\b/g, "inferior izquierda"],
  [/\bBR\b/g, "inferior derecha"],
];

export function humanizePositionId(code: string): string {
  if (!code) return "";
  const upper = code.trim().toUpperCase();

  // 1. Coincidencia exacta
  if (EXACT_MATCHES[upper]) return EXACT_MATCHES[upper];

  // 2. Aplicar transformaciones de tokens
  let cleaned = upper;
  for (const [pattern, replacement] of TOKEN_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 3. Si tras limpieza coincide con un match exacto, usar ese
  if (EXACT_MATCHES[cleaned.toUpperCase()]) return EXACT_MATCHES[cleaned.toUpperCase()];

  // 4. Capitalización limpia (no SHOUTING)
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

/**
 * Versión que SIEMPRE devuelve algo legible para el cliente —
 * si humanize no consigue match, al menos no muestra el código crudo.
 * Útil en dropdowns y listas.
 */
export function displayPositionId(
  code: string,
  fallback: string = "Zona disponible",
): string {
  const humanized = humanizePositionId(code);
  if (!humanized || humanized.length < 2) return fallback;
  return humanized;
}
