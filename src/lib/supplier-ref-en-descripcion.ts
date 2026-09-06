/**
 * Detecta referencias de catálogo del PROVEEDOR incrustadas en el texto que la
 * ficha pública enseña al cliente.
 *
 * POR QUÉ EXISTE — el 2026-09-04 el barrido vivo suspendió con `/catalogo/basics
 * → supplier-sku`: la `shortDescription` que se sirve en el `<meta description>`,
 * en `og:description` y en el cuerpo de la ficha terminaba en una referencia del
 * proveedor. Ninguna de las dos vigilancias que ya había podía verlo:
 *
 *   · `api-publica-sin-supplierref.guard.test.ts` mira el CAMPO `supplierRef`
 *     en el código y con un centinela que lo inyecta. Aquí el dato no viaja por
 *     ese campo: viaja dentro de la prosa comercial que redacta el proveedor.
 *   · El barrido vivo escanea el HTML con `public-supplier-leak-patterns`, cuyo
 *     patrón `supplier-sku` es `\b(ar|mo|cx|mk)[0-9]{3,5}\b`. Casó por suerte con
 *     un prefijo de los cuatro que conoce; las referencias del proveedor que más
 *     aparece (`T-1302`, `Z-1205`, `10101`) no empiezan por ninguno.
 *
 * Y no se puede resolver con un patrón más ancho: `\d{5}` suelto es una medida,
 * un año o una norma. Lo medido el 2026-09-05 sobre el catálogo activo lo prueba
 * — de 155 fichas que casaban, 16 eran `ISO 20471`, `ISO 22196` e `ISO 20743`,
 * números de NORMA que coinciden con referencias reales del proveedor. Un
 * detector que las cuente como fuga es ruido, y el ruido acaba en que nadie mire.
 *
 * La salida es cruzar contra el mundo: un token solo cuenta si EXISTE como
 * `supplierRef` de un producto del MISMO proveedor. Eso no tiene falsos
 * positivos por combinatoria, y caza también el caso que un filtro por la ref
 * propia dejaría escapar — una ficha que cita la referencia de OTRO artículo
 * del catálogo del proveedor («el modelo "Clásico" (T-1302) y el "Halcón"
 * (T-1303)»), que es la mitad de lo medido.
 *
 * Ver [[rule_no_supplier_exposure]]: decisión de Mario, sin excepción — «el
 * cliente que nunca sepa el nombre de dónde compramos o de nuestros proveedores».
 */

/**
 * Formas en que el proveedor escribe sus referencias, medidas sobre el catálogo
 * activo el 2026-09-05: `T-1302` / `Z-1205` (letra, guion y 3-4 dígitos) y
 * `10101` (5 dígitos). Las referencias de 3 y 4 dígitos sueltos NO se buscan a
 * propósito: son indistinguibles de una medida o una cantidad, y el cruce con
 * la tabla no basta para salvarlas.
 *
 * Las dos formas NO llevan la misma frontera por la izquierda, y la diferencia
 * sale de un caso real: `…46 x 16 x 49 CMZ-1205 BOLSA PAPEL TOWER…` publica la
 * referencia pegada a la palabra anterior, sin espacio. Exigir separador la
 * dejaría escapar. Con la forma numérica no se puede ser tan laxo —`101010`
 * contiene `10101`—, así que ahí la frontera sigue siendo estricta. Lo que
 * sostiene la parte laxa es el cruce contra el catálogo: `Z-1205` solo cuenta
 * si existe de verdad como referencia del proveedor.
 *
 * Por la derecha, un GUION no corta. Primer borrador sí lo hacía, y al pasarlo
 * por el catálogo real se comió cuatro fichas que sí publican la referencia:
 * `T-484- 32,5 x 23,5 x 12 cm` (la referencia y el guion que abre la medida) y
 * `Ref. T-161-MD` (la referencia con el sufijo de la variante). En los dos
 * casos el cliente lee la referencia entera. Una letra o un dígito pegados sí
 * cortan, que es lo que evita confundir `T-484` con `T-4840`.
 */
const TOKEN = /(?<![0-9-])([A-Za-z]-\d{3,4})(?![A-Za-z0-9])|(?<![A-Za-z0-9])(\d{5})(?![A-Za-z0-9])/g;

/**
 * Lo que precede a un número de NORMA técnica. Medido: 16 de las 155
 * coincidencias del catálogo eran `ISO 20471` (alta visibilidad), `ISO 22196` y
 * `ISO 20743` (actividad antibacteriana) — texto legítimo que el cliente
 * necesita leer, y que además coincide con referencias reales del proveedor.
 * Se mira lo que hay JUSTO ANTES del token, no una ventana suelta.
 */
const NORMA = /(?:ISO|EN|UNE|DIN|AENOR|AATCC|ASTM)\s*$/i;

export type RefEnTexto = {
  /** El token tal cual aparece en el texto. */
  token: string;
  /** Dónde empieza dentro del texto, para poder mostrar contexto. */
  index: number;
  /** `true` si el token es la referencia del propio producto. */
  propia: boolean;
};

/**
 * Devuelve las referencias de proveedor que el texto publica.
 *
 * @param texto        el que ve el cliente (`enhancedShortDescription` si existe,
 *                     si no `shortDescription`).
 * @param refsConocidas referencias del MISMO proveedor, en mayúsculas.
 * @param refPropia    la del producto, para distinguirla en el informe.
 */
export function refsDeProveedorEnTexto(
  texto: string | null | undefined,
  refsConocidas: ReadonlySet<string>,
  refPropia?: string | null,
): RefEnTexto[] {
  if (!texto) return [];
  const propia = refPropia?.toUpperCase().trim() ?? null;
  const salida: RefEnTexto[] = [];
  const vistos = new Set<string>();

  // `TOKEN` es global y se reutiliza entre llamadas: sin esto, el `lastIndex`
  // de la llamada anterior se cuela en la siguiente. Es el mismo bug que costó
  // un ciclo el 2026-09-02 al extraer el escáner de fugas.
  TOKEN.lastIndex = 0;

  for (let m = TOKEN.exec(texto); m !== null; m = TOKEN.exec(texto)) {
    const token = m[1] ?? m[2];
    const index = m.index;
    const clave = token.toUpperCase();
    if (!refsConocidas.has(clave)) continue;
    if (NORMA.test(texto.slice(Math.max(0, index - 12), index))) continue;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ token, index, propia: clave === propia });
  }
  return salida;
}
