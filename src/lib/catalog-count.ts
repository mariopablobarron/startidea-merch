/**
 * Cifra del tamaño del catálogo para las superficies públicas.
 *
 * Medido en producción el 26-ago-2026: la MISMA home servía tres cifras
 * distintas del mismo catálogo al mismo visitante —el hero «+9618 productos»,
 * el bloque de categorías «Más de 2.000 referencias» y el bloque SEO «más de
 * 9.000 productos»—, y el `manifest.json` una cuarta, «2.400+». El catálogo
 * real tenía 9.618 productos activos: la cifra de categorías estaba 4,8 veces
 * por debajo. Un cliente que lee la home entera ve la contradicción de un
 * bloque al siguiente, y la cifra baja es además la que menos vende.
 *
 * La causa no es que nadie supiera el número: `getHeroData()` ya lo cuenta con
 * `prisma.product.count()` en cada render de la home. Simplemente solo se lo
 * pasaba al hero, y los demás bloques llevaban su propio literal escrito a
 * mano en un momento distinto del crecimiento del catálogo.
 *
 * Por eso aquí no se guarda ningún número de catálogo: se formatea el que
 * viene de la base de datos. Un literal vuelve a quedarse viejo; una función
 * que redondea el recuento real, no.
 */

/**
 * Redondea A LA BAJA al millar y lo formatea en español: 9.618 → «9.000».
 *
 * A la baja a propósito: la frase que lo envuelve es «más de X», así que
 * redondear al alza convertiría una cifra honesta en una que promete de más.
 * Con el catálogo por debajo de mil se devuelve el recuento exacto, porque
 * redondear 840 a la baja daría «más de 0».
 */
export function formatCatalogFloor(count: number | undefined | null): string {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return FALLBACK_LABEL;
  }
  const floored = count >= 1000 ? Math.floor(count / 1000) * 1000 : Math.floor(count);
  return groupThousands(floored);
}

/**
 * Lo que se dice cuando la base de datos no responde (build o caída).
 *
 * Deliberadamente vago en vez de un número inventado: si no se puede contar,
 * la respuesta honesta es no dar cifra, no dar la del año pasado. El fallback
 * anterior era «2.400», que ya mentía por defecto cuando se escribió.
 */
export const FALLBACK_LABEL = "miles de";

/**
 * Agrupa los millares con punto: 9000 → «9.000».
 *
 * A mano, y no con `toLocaleString("es-ES")`, porque **el contenedor de
 * producción corre Node con small-icu** (comprobado el 26-ago-2026 dentro de
 * `merch-app`): el locale sí resuelve a es-ES —la coma decimal y el símbolo €
 * son correctos— pero **la agrupación de millares no se aplica**, así que
 * `(9618).toLocaleString("es-ES")` devuelve «9618», sin punto. Delegar el
 * formato daría una cifra distinta en local y en producción, y la de
 * producción sería la fea.
 */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
