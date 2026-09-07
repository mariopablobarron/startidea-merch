/**
 * Barrido POR DESCUBRIMIENTO de jerga mayorista en los textos públicos del catálogo.
 *
 * Por qué existe: la fuga del argumentario mayorista reapareció CINCO veces por
 * puertas distintas (entrada del sync → salida → índice de búsqueda → flexión de
 * la palabra → errata del proveedor). Cada vez se cerró ampliando el patrón a ojo
 * sobre la lista de casos conocidos, y cada vez apareció un sexto caso. Lo único
 * que rompió el ciclo, el 07-sep-2026, fue mirar TODAS las fichas activas en vez
 * de las que ya sabíamos: 94 filas candidatas, de las que solo UNA estaba sucia.
 *
 * Ese barrido se reconstruyó a mano. Esto lo convierte en código versionado para
 * que la próxima vez no dependa de que alguien recuerde cómo se hizo.
 *
 * Dos ideas que no hay que perder al tocar este fichero:
 *
 *   1. **El veredicto lo da el saneador REAL** (`supplierJargonHits`), no una
 *      copia del patrón. Un detector duplicado es exactamente cómo divergieron
 *      los dos escaneos anti-fuga el 13-ago: las listas seguían idénticas y lo
 *      que cambió fue CÓMO se buscaba.
 *
 *   2. **El ancla NO filtra.** Se clasifican todas las fichas; el ancla solo
 *      separa el informe en «esto habla de distribuidores y está limpio» (el
 *      castellano legítimo: «diseño exclusivo») y el resto. Si el ancla filtrara,
 *      una redacción futura que no la contenga sería invisible — que es el modo
 *      de fallo que este barrido existe para no repetir.
 */

import { supplierJargonHits } from "./suppliers/sanitize-supplier-text";

/** Los cinco campos de texto de `Product` que acaban delante del cliente. */
export const CAMPOS_PUBLICOS = [
  "name",
  "shortDescription",
  "longDescription",
  "enhancedShortDescription",
  "material",
] as const;

export type CampoPublico = (typeof CAMPOS_PUBLICOS)[number];

/**
 * Vocabulario del argumentario mayorista, a propósito ANCHO: no decide nada,
 * solo marca qué merece una mirada humana cuando el saneador dice que está
 * limpio. Incluye «exclusiv» y «margen», que en castellano normal son inocentes.
 */
export const ANCLA_DESCUBRIMIENTO =
  /(distribuidor|rotulista|revendedor|mayorista|margen|exclusiv|profesional del sector|precio de coste)/i;

export type FichaTexto = { slug: string } & Partial<Record<CampoPublico, string | null>>;

export type Hallazgo = {
  slug: string;
  campo: CampoPublico;
  hits: string[];
  /** Trozo corto alrededor de la primera coincidencia, para poder actuar sin volcar la ficha entera. */
  extracto: string;
};

export type ResultadoBarrido = {
  /** Fichas examinadas. */
  fichas: number;
  /** Campos con texto no vacío que se han pasado por el detector. */
  camposRevisados: number;
  /** Campos que mencionan el vocabulario mayorista (sucios o no). */
  camposConAncla: number;
  /** Lo que el saneador REAL considera jerga: hay que actuar sobre esto. */
  sucios: Hallazgo[];
  /** Slugs distintos afectados. */
  slugsSucios: string[];
  /**
   * Campos que hablan de distribuidores/márgenes y el saneador da por limpios.
   * Es el castellano legítimo. Se cuenta —no se lista— para poder decir «he
   * mirado N, no N de las que ya sabía».
   */
  camposLimpiosConAncla: number;
};

/** Extracto de ~120 caracteres centrado en la primera coincidencia. */
export function extracto(texto: string, aguja: string, radio = 60): string {
  const i = texto.toLowerCase().indexOf(aguja.toLowerCase());
  if (i < 0) return texto.slice(0, radio * 2).trim();
  const desde = Math.max(0, i - radio);
  const hasta = Math.min(texto.length, i + aguja.length + radio);
  return `${desde > 0 ? "…" : ""}${texto.slice(desde, hasta).trim()}${hasta < texto.length ? "…" : ""}`;
}

export function barrerJergaMayorista(fichas: FichaTexto[]): ResultadoBarrido {
  const sucios: Hallazgo[] = [];
  let camposRevisados = 0;
  let camposConAncla = 0;
  let camposLimpiosConAncla = 0;

  for (const ficha of fichas) {
    for (const campo of CAMPOS_PUBLICOS) {
      const texto = ficha[campo];
      if (!texto || !texto.trim()) continue;
      camposRevisados++;

      const tieneAncla = ANCLA_DESCUBRIMIENTO.test(texto);
      if (tieneAncla) camposConAncla++;

      const hits = supplierJargonHits(texto);
      if (hits.length > 0) {
        sucios.push({ slug: ficha.slug, campo, hits, extracto: extracto(texto, hits[0]) });
      } else if (tieneAncla) {
        camposLimpiosConAncla++;
      }
    }
  }

  return {
    fichas: fichas.length,
    camposRevisados,
    camposConAncla,
    sucios,
    slugsSucios: [...new Set(sucios.map((s) => s.slug))],
    camposLimpiosConAncla,
  };
}
