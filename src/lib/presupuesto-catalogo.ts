/**
 * El puente entre el catálogo y una línea del presupuesto.
 *
 * Hasta ahora cada línea se tecleaba entera —nombre, referencia, coste, área de
 * marcaje— aunque el producto estuviera en el catálogo con todos esos datos ya
 * sincronizados del proveedor. Teclear a mano un área de marcaje o una
 * referencia es la forma más barata de meter una errata en un documento que se
 * manda a un cliente.
 *
 * ── El coste llega SIN CONFIRMAR, a propósito ───────────────────────────────
 * El encargo es explícito: los precios se consultan en el portal del proveedor
 * a la cantidad exacta, y el catálogo propio **no es fuente de precio**. Aquí no
 * se desobedece: el coste del tramo viaja como SUGERENCIA y la línea queda
 * marcada como no verificada hasta que alguien lo contrasta y lo toca. El
 * editor lo enseña en rojo mientras tanto.
 *
 * Lo que sí se trae con confianza es la identidad y la técnica: nombre,
 * referencia STM, foto y el área de marcaje —que desde el arreglo del feed ya
 * está en milímetros de verdad—, porque eso no es un precio.
 */

import { pickTier, type PriceTier } from "@/lib/pricing";

export type ProductoParaLinea = {
  slug: string;
  /** Referencia pública STM-… ; nunca la del proveedor. */
  referencia: string | null;
  nombre: string;
  imagenUrl: string | null;
  material: string | null;
  medidas: string | null;
  /** Coste NETO del proveedor al tramo pedido, en céntimos. Sugerencia. */
  costeUnitCents: number | null;
  /** Cantidad del tramo del que sale ese coste. */
  tramoMinQty: number | null;
  /** Rama de categorías, de la hoja a la raíz. Es lo que decide el margen. */
  familias: string[];
  /**
   * Margen sobre venta que le toca a este producto por su familia, ya
   * resuelto en el servidor (que es donde viven los ajustes del panel).
   */
  margenFamiliaPct: number;
  marcaje: {
    posicion: string;
    areaMaxima: string | null;
    tecnica: string | null;
  } | null;
};

/** "300 × 230 mm" a partir de las medidas del producto, o null si no las hay. */
export function formatearMedidas(args: {
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
}): string | null {
  const partes = [args.lengthMm, args.widthMm, args.heightMm].filter(
    (n): n is number => typeof n === "number" && n > 0,
  );
  if (partes.length === 0) return null;
  return `${partes.join(" × ")} mm`;
}

/** "150 × 70 mm" del área de una posición de marcaje. */
export function formatearArea(anchoMm?: number | null, altoMm?: number | null): string | null {
  if (!anchoMm || !altoMm) return null;
  return `${Math.round(anchoMm)} × ${Math.round(altoMm)} mm`;
}

/**
 * Coste del tramo que aplica a esa cantidad.
 *
 * `pickTier` devuelve el tramo más alto que no pasa de la cantidad; con una
 * cantidad por debajo del primer tramo devuelve el primero, que es el más caro
 * — que es lo correcto: prometer el precio de 2.000 uds en un pedido de 100
 * sería regalar margen.
 */
export function costeAlTramo(
  tiers: Array<{ minQty: number; unitPriceCents: number }>,
  cantidad: number,
): { costeUnitCents: number; tramoMinQty: number } | null {
  if (tiers.length === 0) return null;
  const comoTramos: PriceTier[] = tiers.map((t) => ({
    minQty: t.minQty,
    unitPriceCents: t.unitPriceCents,
    source: "PROVIDER",
  }));
  const elegido = pickTier(comoTramos, cantidad);
  if (!elegido) return null;
  return { costeUnitCents: elegido.unitPriceCents, tramoMinQty: elegido.minQty };
}

// ── De producto a línea ──────────────────────────────────────────────────────
//
// Estas dos funciones son la política, y viven aquí y no en el editor para que
// se puedan probar: qué se copia, qué NO se pisa y con qué grado de confianza
// entra el coste.

/** Los campos de una línea de presupuesto que salen de un producto. */
export type CamposLineaDesdeProducto = {
  concepto: string;
  referencia: string;
  imagenUrl: string;
  cantidad: number;
  costeUnitCents: number;
  costeVerificado: boolean;
  /** Margen propio de la línea, o null para seguir al del presupuesto. */
  margenPct: number | null;
  pvpUnitCents: number;
};

/**
 * Rellena una línea con el producto elegido.
 *
 * `costeVerificado` sale SIEMPRE en false, aunque el catálogo tenga tarifa de
 * proveedor: quien decide si ese número sirve es la persona que lo mira en el
 * portal a esta cantidad, no el feed de anoche.
 *
 * El PVP se propone al margen que le toca a la familia del producto (los
 * ajustes del panel), no al 30 % fijo: el gran formato y el textil no se
 * cotizan al mismo punto. Es una propuesta: si el coste cambia al
 * confirmarlo, hay que recalcular el PVP.
 */
export function lineaDesdeProducto(
  producto: ProductoParaLinea,
  cantidad: number,
  margenPresupuestoPct: number,
  pvpDesdeCosteYMargen: (costeCents: number, margenPct: number) => number,
): CamposLineaDesdeProducto {
  const coste = producto.costeUnitCents ?? 0;
  const margen = producto.margenFamiliaPct;
  return {
    concepto: producto.nombre,
    referencia: producto.referencia ?? "",
    imagenUrl: producto.imagenUrl ?? "",
    cantidad,
    costeUnitCents: coste,
    costeVerificado: false,
    // Solo se fija margen propio si la familia se aparta del del presupuesto.
    // Dejarlo en null cuando coinciden hace que la línea siga al presupuesto
    // si luego se cambia el margen general, que es lo que se espera.
    margenPct: margen === margenPresupuestoPct ? null : margen,
    pvpUnitCents: coste > 0 ? pvpDesdeCosteYMargen(coste, margen) : 0,
  };
}

/** Los campos de la ficha técnica de una opción que salen de un producto. */
export type CamposFichaDesdeProducto = {
  fotoProductoUrl: string;
  medidas: string;
  materiales: string;
  marcajeAreaMaxima: string;
  marcajeTecnica: string;
  marcajePosicion: string;
};

/**
 * Completa la ficha técnica de la opción con los datos del producto.
 *
 * Solo rellena lo que está vacío. Si alguien ha escrito «300 × 230 cm» a mano
 * porque el producto va montado de otra forma, ese texto vale más que el del
 * catálogo y no se toca.
 */
export function fichaDesdeProducto(
  actual: CamposFichaDesdeProducto,
  producto: ProductoParaLinea,
): CamposFichaDesdeProducto {
  const siVacio = (viejo: string, nuevo: string | null | undefined) =>
    viejo.trim() === "" && nuevo ? nuevo : viejo;
  return {
    fotoProductoUrl: siVacio(actual.fotoProductoUrl, producto.imagenUrl),
    medidas: siVacio(actual.medidas, producto.medidas),
    materiales: siVacio(actual.materiales, producto.material),
    marcajeAreaMaxima: siVacio(actual.marcajeAreaMaxima, producto.marcaje?.areaMaxima),
    marcajeTecnica: siVacio(actual.marcajeTecnica, producto.marcaje?.tecnica),
    marcajePosicion: siVacio(actual.marcajePosicion, producto.marcaje?.posicion),
  };
}
