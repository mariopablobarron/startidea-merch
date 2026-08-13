/**
 * Términos que delatan a un proveedor. Fuente ÚNICA para el código de la app
 * del catálogo que ya vive en `scripts/money-smoke-test.mjs` (un script Node
 * suelto que corre en CI contra producción y que desde TypeScript no se puede
 * importar). Las dos listas se mantienen sincronizadas por un guard —
 * `supplier-leak-terms.guard.test.ts`— que lee el .mjs como texto y compara.
 *
 * Regla dura del negocio: el cliente NUNCA ve el nombre del proveedor, la
 * `supplierRef` ni una URL de su CDN. Solo `publicRef` (STM-XXX) e imágenes
 * por `/api/m/<hash>`. Ver [[rule_no_supplier_exposure]] y la fuga real del
 * 2026-07-20 en /api/recommend.
 */

/**
 * Nombres de proveedor. Se buscan como PALABRA COMPLETA, no como subcadena:
 *
 *  - "cifra" es además una palabra corriente en español, y buscarla como
 *    subcadena marcaría "descifrar" o "cifrado" — ruido que acabaría con
 *    alguien desactivando el saneador.
 *  - Como palabra suelta SÍ se bloquea ("precio según cifra acordada"), y es
 *    deliberado: en un concepto de línea de propuesta —que describe un
 *    producto— esa frase es rarísima, mientras que dejar pasar "Cifra" como
 *    proveedor imprime su nombre en el PDF del cliente. El falso positivo
 *    cuesta reescribir una palabra; el falso negativo cuesta la regla.
 */
export const SUPPLIER_LEAK_TERMS = [
  "midocean",
  "makito",
  "cifra",
  "adivin",
  "supplierref",
  "supplier_ref",
] as const;

/**
 * Hosts de CDN de proveedor. Van APARTE y se buscan como SUBCADENA porque
 * varios no contienen el nombre del proveedor (y los puntos no son límites de
 * palabra): así fue exactamente como la fuga del 2026-07-20 pasó el guard.
 */
export const SUPPLIER_LEAK_HOSTS = [
  "cdn1.midocean.com",
  "publicatalogue.com",
  "imgresources.makito.es",
  "adivin.com",
] as const;

/**
 * Devuelve el primer término de proveedor encontrado en `text`, o null si el
 * texto está limpio. Insensible a mayúsculas y a acentos decorativos no: se
 * compara en minúsculas tal cual, que es como aparecen estos nombres.
 */
export function findSupplierLeak(text: string): string | null {
  const haystack = text.toLowerCase();
  for (const host of SUPPLIER_LEAK_HOSTS) {
    if (haystack.includes(host)) return host;
  }
  for (const term of SUPPLIER_LEAK_TERMS) {
    // \b no sirve con "supplier_ref": en JS el guion bajo es carácter de
    // palabra, así que \bsupplier_ref\b nunca casaría dentro de "x_supplier_ref".
    // Se delimita a mano con lo que NO puede formar parte del término.
    const re = new RegExp(`(^|[^a-z0-9_])${term}($|[^a-z0-9_])`, "i");
    if (re.test(haystack)) return term;
  }
  return null;
}
