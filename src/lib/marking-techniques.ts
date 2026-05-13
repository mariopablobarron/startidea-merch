/**
 * Diccionario de técnicas de marcaje con descripciones cortas para tooltips
 * inline en los selects de configuración. Misma info que /ayuda pero
 * contextual en el punto de decisión.
 *
 * Códigos alineados con MidOcean (S1, S2, P1, T1, L1, D1, DTF, SUB…)
 * pero la búsqueda es por código corto o nombre normalizado.
 */

export type MarkingTechniqueInfo = {
  pros: string[];
  cons: string[];
  bestFor: string;
  minQty: number;
};

const TECHNIQUES: Record<string, MarkingTechniqueInfo> = {
  // Serigrafía (S1, S2, screen-print, silkscreen)
  serigrafia: {
    pros: [
      "Colores planos vivos y duraderos",
      "Mejor relación calidad/precio en volumen",
      "Ideal para textil, papel y plástico rígido",
    ],
    cons: ["No degradados ni fotos", "Mínimos altos por color"],
    bestFor: "Camisetas, tote bags, bolígrafos, libretas",
    minQty: 25,
  },

  // Bordado (E1, embroidery, embroidered)
  bordado: {
    pros: [
      "Acabado premium y duradero (resiste 100+ lavados)",
      "Textura 3D que aporta calidad percibida",
      "Ideal para polos, sudaderas, gorras y mochilas",
    ],
    cons: ["Coste superior", "Mínimo recomendado 25 ud", "No para detalles finos <3mm"],
    bestFor: "Polos corporativos, gorras, sudaderas, mochilas",
    minQty: 25,
  },

  // Láser / grabado láser (L1, laser, laser-engrave)
  laser: {
    pros: [
      "Acabado elegante y permanente",
      "Ideal para metal, madera, vidrio y cuero",
      "No se borra ni decolora",
    ],
    cons: ["Solo un color (tono natural del material)", "No para textil"],
    bestFor: "Bolígrafos metálicos, llaveros, USB, botellas, cuadernos de tapa dura",
    minQty: 25,
  },

  // Doming (D1, dome, resin-dome)
  doming: {
    pros: [
      "Pegatina resina con efecto 3D brillante",
      "Reproduce logos a todo color con detalle fotográfico",
      "Resistente a roces y exteriores",
    ],
    cons: ["Aspecto plástico no apto para todas las marcas", "Coste medio"],
    bestFor: "Llaveros, USB, productos rígidos con superficie plana",
    minQty: 50,
  },

  // Transfer (T1, transfer, heat-transfer, digital)
  transfer: {
    pros: [
      "Color ilimitado, fotos y degradados",
      "Reproduce logos complejos sin coste extra",
      "Ideal para tiradas pequeñas",
    ],
    cons: ["Tacto plastificado en textil fino", "Durabilidad media en lavados intensivos"],
    bestFor: "Camisetas con diseños complejos, fotos, ediciones cortas",
    minQty: 10,
  },

  // DTF (Direct to Film)
  dtf: {
    pros: [
      "Color ilimitado en textil con tacto suave",
      "Excelente reproducción de fotos y degradados",
      "Resiste 40+ lavados sin perder color",
    ],
    cons: ["Coste por unidad superior a serigrafía en volumen", "No apto para tejidos elásticos extremos"],
    bestFor: "Textil técnico, ropa deportiva, camisetas con diseños fotográficos",
    minQty: 10,
  },

  // Sublimación
  sublimacion: {
    pros: [
      "Color penetra en la fibra: tacto cero",
      "Ideal para tejido técnico poliéster blanco",
      "Permite estampado all-over",
    ],
    cons: ["Solo funciona sobre poliéster claro", "No sobre algodón ni colores oscuros"],
    bestFor: "Camisetas deportivas, banderas, foulards, mascarillas",
    minQty: 25,
  },

  // Tampografía / pad printing (P1, pad-print)
  tampografia: {
    pros: [
      "Ideal para superficies pequeñas, curvas o irregulares",
      "Buena precisión en detalles finos",
      "Económica en grandes volúmenes",
    ],
    cons: ["Hasta 4 colores planos típico", "No para textil"],
    bestFor: "Bolígrafos, mecheros, pelotas, productos pequeños rígidos",
    minQty: 100,
  },

  // Digital print directo
  digital: {
    pros: [
      "Color ilimitado, fotos y degradados",
      "Sin coste por color",
      "Ideal para series cortas",
    ],
    cons: ["Coste por unidad superior a serigrafía en volumen"],
    bestFor: "Tarjetas, packaging, productos con superficie plana",
    minQty: 25,
  },

  // Vinilo / vinyl cut
  vinilo: {
    pros: [
      "Resistente y duradero",
      "Ideal para textos, números y formas simples",
      "Económico para tiradas pequeñas",
    ],
    cons: ["Solo colores planos", "No detalles muy finos"],
    bestFor: "Camisetas con nombres y dorsales, rotulación de pequeños objetos",
    minQty: 10,
  },
};

/**
 * Busca info de una técnica por nombre o código de marcaje.
 * Tolerante a mayúsculas, acentos y variantes ("Serigrafía", "screen-print", "S1").
 */
export function getMarkingTechniqueInfo(nameOrCode: string | null | undefined): MarkingTechniqueInfo | null {
  if (!nameOrCode) return null;
  const norm = nameOrCode
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin acentos
    .replace(/[^a-z0-9]/g, ""); // sin espacios ni guiones

  // Coincidencia directa
  if (TECHNIQUES[norm]) return TECHNIQUES[norm];

  // Aliases comunes
  const aliases: Record<string, keyof typeof TECHNIQUES> = {
    silkscreen: "serigrafia",
    screenprint: "serigrafia",
    screenprinting: "serigrafia",
    s1: "serigrafia",
    s2: "serigrafia",
    embroidery: "bordado",
    embroidered: "bordado",
    e1: "bordado",
    laserengrave: "laser",
    laserengraving: "laser",
    engrave: "laser",
    engraving: "laser",
    grabado: "laser",
    l1: "laser",
    dome: "doming",
    resindome: "doming",
    d1: "doming",
    heattransfer: "transfer",
    digitaltransfer: "transfer",
    t1: "transfer",
    dtfprint: "dtf",
    directtofilm: "dtf",
    sublimation: "sublimacion",
    sublimationprint: "sublimacion",
    padprint: "tampografia",
    padprinting: "tampografia",
    p1: "tampografia",
    digitalprint: "digital",
    inkjet: "digital",
    uv: "digital",
    vinyl: "vinilo",
    vinylcut: "vinilo",
    flex: "vinilo",
  };
  if (aliases[norm]) return TECHNIQUES[aliases[norm]];

  // Búsqueda por prefix (último recurso)
  for (const key of Object.keys(TECHNIQUES)) {
    if (norm.startsWith(key) || key.startsWith(norm)) return TECHNIQUES[key];
  }

  return null;
}
