/**
 * Familias de gran formato capturadas SOLO a trozos.
 *
 * ── El caso ─────────────────────────────────────────────────────────────────
 * Del photocall se importaron «Estructura Photocall» y «Lona suelta para
 * Photocall» por separado, pero no el pack completo (lona impresa + estructura
 * + tensores + estuche), que es más barato y más completo que la suma de las
 * piezas. Un cliente que entra a por un photocall ve dos medias piezas y ningún
 * producto que comprar.
 *
 * ── Qué NO era ──────────────────────────────────────────────────────────────
 * No es que el importador descarte los packs: importa los que hay («Bandera y
 * mástil para pared Pack», «Fly Banner Surf Pack completo», «Pack tensores
 * elásticos»). El pack completo del photocall **no está en la captura del
 * catálogo**, que es de donde sale el seed. Por eso esto no lo arregla el
 * código: hay que capturar esos productos del proveedor.
 *
 * ── La señal ────────────────────────────────────────────────────────────────
 * Una familia está a medias cuando tiene las DOS mitades de un producto
 * —soporte (estructura, mástil, base) y gráfica (lona, tela, bandera)— vendidas
 * sueltas y ningún artículo que sea el conjunto. Sobre el catálogo actual eso
 * señala tres familias y ni un falso positivo; con reglas más laxas ("todo son
 * componentes") saltaban las categorías de accesorios, que están así a
 * propósito.
 */

export type ItemGranFormato = {
  name: string;
  /** URL del producto en el catálogo de origen: de ahí sale la familia. */
  sourceUrl: string;
};

export type FamiliaSinPack = {
  familia: string;
  soportes: string[];
  graficas: string[];
};

const SOPORTE_RE = /\b(estructura|m[áa]stil|base|soporte|mochila)\b/i;
// "banner" NO entra: es el nombre de media familia («Base Fly Banner para
// carpa» es un soporte, no una gráfica) y colaba la categoría de bases enteras
// como si fuera un producto a medias.
const GRAFICA_RE = /\b(lona|tela|gr[áa]fica|bandera|banderin|banderín)\b/i;
const COMPONENTE_RE = new RegExp(
  `\\b(suelt[ao]s?|${SOPORTE_RE.source.slice(2, -2)}|${GRAFICA_RE.source.slice(2, -2)}|estuche|funda|pata|manivela|fuelle|tensores|ruedas|rollo|gr[áa]fica)\\b`,
  "i",
);
const PACK_RE = /\b(pack|kit)\b/i;
const COMPLETO_RE = /\b(complet[oa]s?)\b/i;

/** "https://adivin.com/es/photocall/449-…" → "photocall" */
export function familiaDeUrl(sourceUrl: string): string | null {
  const m = /\/es\/([^/]+)\//.exec(sourceUrl);
  return m ? m[1] : null;
}

/** Palabras con las que se reconoce a la familia dentro del nombre de un artículo. */
function palabrasFamilia(familia: string): string[] {
  return familia
    .split("-")
    .filter((w) => w.length > 3 && !["para", "de", "del", "los", "las"].includes(w))
    .map((w) => w.replace(/s$/, ""));
}

/**
 * ¿Este artículo es el producto entero y no una pieza?
 *
 * Lo es si dice «completo», si es un pack que nombra a su familia («Bandera y
 * mástil para pared Pack») o si se llama como la familia sin ser una pieza
 * («Cubo Publicitario» frente a «Estructura Cubo Publicitario»).
 *
 * Un «Pack tensores elásticos» NO cuenta: es un pack de accesorios, no el
 * photocall. Confundirlos es justo lo que dejaría el hueco sin detectar.
 */
export function esProductoCompleto(name: string, familia: string): boolean {
  if (COMPLETO_RE.test(name)) return true;
  const nombreNormalizado = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nombraFamilia = palabrasFamilia(familia).some((w) => nombreNormalizado.includes(w));
  if (PACK_RE.test(name) && nombraFamilia) return true;
  return nombraFamilia && !COMPONENTE_RE.test(name);
}

/**
 * Familias con soporte y gráfica sueltos y sin conjunto que comprar.
 * Ordenadas por nombre para que la salida sea estable.
 */
export function detectarFamiliasSinPack(items: ItemGranFormato[]): FamiliaSinPack[] {
  const porFamilia = new Map<string, ItemGranFormato[]>();
  for (const item of items) {
    const familia = familiaDeUrl(item.sourceUrl);
    if (!familia) continue;
    if (!porFamilia.has(familia)) porFamilia.set(familia, []);
    porFamilia.get(familia)!.push(item);
  }

  const huecos: FamiliaSinPack[] = [];
  for (const [familia, articulos] of porFamilia) {
    if (articulos.some((a) => esProductoCompleto(a.name, familia))) continue;
    // Clasificación EXCLUSIVA, y la gráfica manda: «Bandera suelta Mochila Fly
    // Banner» nombra las dos cosas y es la bandera. Sin esto el mismo artículo
    // salía en las dos columnas del informe.
    const graficas = articulos.filter((a) => GRAFICA_RE.test(a.name)).map((a) => a.name);
    const soportes = articulos
      .filter((a) => SOPORTE_RE.test(a.name) && !GRAFICA_RE.test(a.name))
      .map((a) => a.name);
    if (soportes.length > 0 && graficas.length > 0) {
      huecos.push({ familia, soportes, graficas });
    }
  }
  return huecos.sort((a, b) => a.familia.localeCompare(b.familia));
}
