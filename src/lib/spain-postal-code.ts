/**
 * Helpers para códigos postales españoles.
 *
 * Los CP españoles son de 5 dígitos. Los 2 primeros identifican unívocamente
 * la provincia (52: Ceuta 51, Melilla 52). Mapeo oficial de Correos.
 *
 * Útil para rellenar `zone` (provincia) en payloads de proveedores que la
 * piden cuando solo tenemos código postal en el cart (caso Cifra).
 */

const PROVINCIAS: Record<string, string> = {
  "01": "Álava",
  "02": "Albacete",
  "03": "Alicante",
  "04": "Almería",
  "05": "Ávila",
  "06": "Badajoz",
  "07": "Illes Balears",
  "08": "Barcelona",
  "09": "Burgos",
  "10": "Cáceres",
  "11": "Cádiz",
  "12": "Castellón",
  "13": "Ciudad Real",
  "14": "Córdoba",
  "15": "A Coruña",
  "16": "Cuenca",
  "17": "Girona",
  "18": "Granada",
  "19": "Guadalajara",
  "20": "Gipuzkoa",
  "21": "Huelva",
  "22": "Huesca",
  "23": "Jaén",
  "24": "León",
  "25": "Lleida",
  "26": "La Rioja",
  "27": "Lugo",
  "28": "Madrid",
  "29": "Málaga",
  "30": "Murcia",
  "31": "Navarra",
  "32": "Ourense",
  "33": "Asturias",
  "34": "Palencia",
  "35": "Las Palmas",
  "36": "Pontevedra",
  "37": "Salamanca",
  "38": "Santa Cruz de Tenerife",
  "39": "Cantabria",
  "40": "Segovia",
  "41": "Sevilla",
  "42": "Soria",
  "43": "Tarragona",
  "44": "Teruel",
  "45": "Toledo",
  "46": "Valencia",
  "47": "Valladolid",
  "48": "Bizkaia",
  "49": "Zamora",
  "50": "Zaragoza",
  "51": "Ceuta",
  "52": "Melilla",
};

/**
 * Normaliza un CP español: extrae los 5 dígitos limpios.
 * Devuelve null si no es un CP español válido.
 */
export function normalizeSpanishPostalCode(cp: string | null | undefined): string | null {
  if (!cp) return null;
  // Quitar espacios y no-dígitos, padding zero a la izquierda si vino "28001" o "8001"
  const digits = cp.replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 5) return null;
  const padded = digits.padStart(5, "0");
  // Validar que los 2 primeros dígitos correspondan a una provincia real
  if (!PROVINCIAS[padded.slice(0, 2)]) return null;
  return padded;
}

/**
 * Devuelve el nombre oficial de la provincia para un CP español.
 * Si el CP es inválido o no español, devuelve null.
 *
 * Ejemplos:
 *   provinciaFromPostalCode("29010") → "Málaga"
 *   provinciaFromPostalCode("08001") → "Barcelona"
 *   provinciaFromPostalCode("28028") → "Madrid"
 *   provinciaFromPostalCode("99999") → null
 */
export function provinciaFromPostalCode(cp: string | null | undefined): string | null {
  const normalized = normalizeSpanishPostalCode(cp);
  if (!normalized) return null;
  return PROVINCIAS[normalized.slice(0, 2)] || null;
}

/**
 * Como `provinciaFromPostalCode` pero con fallback al `cityHint` si el CP no
 * resuelve (caso CP extranjero, vacío, mal formado). Útil cuando vas a
 * mandar a un proveedor que NECESITA un valor en `zone`.
 */
export function provinciaFromPostalCodeOrCity(
  cp: string | null | undefined,
  cityHint: string | null | undefined,
): string {
  return provinciaFromPostalCode(cp) || (cityHint?.trim() || "");
}
