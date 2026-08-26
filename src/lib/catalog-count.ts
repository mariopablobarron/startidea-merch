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
 * ⚠️ **Rectificación del 26-ago-2026 (run de mediodía).** El comentario que
 * había aquí decía que se hacía a mano «porque el contenedor de producción
 * corre Node con small-icu y no agrupa los millares». **Es falso, medido
 * dentro de `merch-app`**: Node v22 con **ICU 78.2 completo**, y el mismo
 * número da el mismo resultado en producción y en la estación —999 → «999»,
 * 9618 → «9618», 10000 → «10.000», 12500,50 € → «12.500,50 €»—.
 *
 * Lo que se tomó por un defecto del entorno es **la regla del español en
 * CLDR** (`minimumGroupingDigits = 2`): las cifras de cuatro dígitos no
 * llevan separador, y la agrupación empieza en cinco. `toLocaleString` estaba
 * haciendo lo correcto.
 *
 * Se mantiene el punto a mano por una razón editorial, no técnica: la frase
 * es prosa comercial —«Más de 9.000 productos»— y esa es la forma que el
 * sitio ya servía en el bloque SEO. Delegar en `toLocaleString` daría «9000»
 * mientras el catálogo esté entre 1.000 y 9.999, y cambiaría solo el día que
 * cruce las cinco cifras. Es una decisión de estilo, y conviene que esté
 * escrita como tal: la premisa falsa anterior ya generó en el backlog una
 * tarea entera —«arreglar los millares sin agrupar de /catalogo»— sobre un
 * defecto que no existe.
 */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
