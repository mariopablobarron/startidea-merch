/**
 * Mapping local de técnicas de marcaje al español.
 *
 * MidOcean tiene traducciones ES en su feed pero no para todas las técnicas.
 * Este mapa actúa como fallback cuando el feed devuelve solo EN, y como
 * normalizador cuando el ES del feed suena raro (e.g. "Termo grabado" en
 * lugar de "Bordado láser").
 */
const MAP: Record<string, string> = {
  // En inglés (lo que viene del feed cuando no hay ES)
  embroidery: "Bordado",
  "screen printing": "Serigrafía",
  "screen transfer": "Transfer serigráfico",
  "digital transfer": "Transfer digital",
  "transfer reflective": "Transfer reflectante",
  "pad printing": "Tampografía",
  "laser engraving": "Grabado láser",
  doming: "Resina (doming)",
  debossing: "Termo grabado",
  embossing: "Relieve",
  sublimation: "Sublimación",
  "uv printing": "Impresión UV",
  "digital printing": "Impresión digital",
  "button printing": "Impresión en chapas",
  "full color print": "Impresión a todo color",
  printing: "Impresión",
};

/**
 * Normaliza el nombre de una técnica para mostrar al usuario en español.
 * Si el feed ya devuelve un nombre razonable en ES, lo conserva.
 */
export function normalizeTechniqueName(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  const key = trimmed.toLowerCase();
  if (MAP[key]) return MAP[key];
  // Si ya parece español (contiene tildes o palabras típicas), mantener
  if (/[áéíóúñ]/i.test(trimmed)) return trimmed;
  // Si parece una técnica EN no mapeada, capitalizar como fallback
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
