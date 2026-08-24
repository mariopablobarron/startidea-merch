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
 * Los términos NO son todos de la misma naturaleza, y por eso no se pueden
 * buscar todos igual. Repartirlos en dos grupos es el arreglo del 14-ago:
 * durante un día se buscaron TODOS por palabra completa y eso dejó pasar
 * `midoceanOrderId` — justo el campo cuya fuga se había cerrado la víspera.
 *
 * Nombres que NO existen dentro de ninguna palabra española. Se buscan como
 * SUBCADENA porque no tienen ningún falso positivo posible en castellano, y
 * porque así se cazan también pegados dentro de un IDENTIFICADOR
 * (`midoceanOrderId`, `makito_sku`, `data-midocean`), que es la forma en que
 * un nombre de proveedor llega de verdad a un JSON o a un HTML servido.
 */
export const SUPPLIER_LEAK_TERMS_IDENTIFIER = [
  "midocean",
  "makito",
  "supplierref",
  "supplier_ref",
] as const;

/**
 * Nombres que SÍ son —o empiezan— una palabra corriente en español: "cifra"
 * está dentro de "cifrado" y "descifrar"; "adivin", dentro de "adivinanza".
 * Por subcadena marcarían texto legítimo, y un saneador ruidoso acaba
 * desactivado (pasó el 13-ago: «cifras concretas» en /llms.txt y «cifrado en
 * tránsito» en /privacidad tumbaron el CI sin que hubiera fuga alguna).
 *
 * Se buscan por PALABRA COMPLETA **y además** pegados a una frontera de
 * identificador —mayúscula siguiente o guion bajo—, que no ocurre nunca en
 * prosa española pero sí en `cifraOrderId` o `cifra_ref`. Así se conserva la
 * cobertura sobre nombres de campo sin recuperar el ruido.
 *
 * Como palabra suelta SÍ se bloquea ("precio según cifra acordada"), y es
 * deliberado: en un concepto de línea de propuesta —que describe un producto—
 * esa frase es rarísima, mientras que dejar pasar "Cifra" como proveedor
 * imprime su nombre en el PDF del cliente. El falso positivo cuesta reescribir
 * una palabra; el falso negativo cuesta la regla.
 */
export const SUPPLIER_LEAK_TERMS_WORDLIKE = ["cifra", "adivin"] as const;

/** Todos los nombres de proveedor. El orden es el de comprobación. */
export const SUPPLIER_LEAK_TERMS = [
  ...SUPPLIER_LEAK_TERMS_IDENTIFIER,
  ...SUPPLIER_LEAK_TERMS_WORDLIKE,
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
  for (const term of SUPPLIER_LEAK_TERMS_IDENTIFIER) {
    if (haystack.includes(term)) return term;
  }
  for (const term of SUPPLIER_LEAK_TERMS_WORDLIKE) {
    // Palabra completa. \b no serviría con un término que llevara guion bajo:
    // en JS es carácter de palabra. Se delimita a mano con lo que NO puede
    // formar parte del término.
    if (new RegExp(`(^|[^a-z0-9_])${term}($|[^a-z0-9_])`).test(haystack)) return term;
    // Frontera de IDENTIFICADOR sobre el texto original: `cifraOrderId`,
    // `Cifra_ref`. Se mira el original —no `haystack`— porque la mayúscula ES
    // la señal, y por eso la regex no puede llevar el flag `i`: con él, [A-Z]
    // casaría también minúsculas y volvería el falso positivo de "cifrado".
    if (new RegExp(`(^|[^A-Za-z0-9_])${anyCase(term)}(?=[A-Z_])`).test(text)) return term;
  }
  return null;
}

/** "cifra" → "[cC][iI][fF][rR][aA]": insensible a mayúsculas sin el flag `i`. */
function anyCase(term: string): string {
  return term.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
}

/**
 * ¿Esta URL delata al proveedor, o no es una URL navegable?
 *
 * Se mira el HOST, no la cadena entera: `findSupplierLeak` incluye términos de
 * palabra ("cifra", "adivin") que en una URL dan falso positivo —
 * `/catalogo/cifra-de-negocio` es un slug legítimo del catálogo— y borrar la
 * imagen de un producto real por eso sería peor que el problema que se cierra.
 *
 * Devuelve `true` también para protocolos que no son http(s) ni ruta relativa
 * (`javascript:`, `data:`): un campo llamado `url` que acepta eso es un fallo
 * de validación, no una decisión de producto.
 */
/**
 * Dominios registrables de los proveedores. Se comparan por SUFIJO de host, no
 * como subcadena: así un CDN nuevo del mismo proveedor
 * (`printposition-img-api-v2.cdn.midocean.com`) queda cubierto sin tocar nada.
 * El guard `url-de-proveedor-en-propuesta.guard.test.ts` comprueba que esta
 * lista cubre todos los hosts que `proxy-image.ts` considera de proveedor.
 */
export const SUPPLIER_DOMAINS = [
  "midocean.com",
  "xindao.eu",
  "xindao.com",
  "publicatalogue.com",
  "makito.es",
  "adivin.com",
] as const;

export function urlDelataProveedor(url: string): boolean {
  const limpia = url.trim();
  if (limpia === "") return false;
  // Ruta relativa del propio sitio (`/api/m/<hash>`, `/catalogo/...`): sin host
  // que delate nada. Es la forma correcta y la que produce el código de hoy.
  if (limpia.startsWith("/") && !limpia.startsWith("//")) return false;

  let host: string;
  try {
    const u = new URL(limpia);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    host = u.hostname.toLowerCase();
  } catch {
    // Ni ruta relativa ni URL parseable: no es navegable, fuera.
    return true;
  }
  return SUPPLIER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
