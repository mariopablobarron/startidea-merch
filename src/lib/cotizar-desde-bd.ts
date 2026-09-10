/**
 * Cotizar desde la base de datos: de una referencia y una cantidad al
 * `pedido.json` que consume `presupuestos/montar-presupuesto.py`.
 *
 * Aquí NO se calcula ningún precio nuevo. El coste al tramo, la tarifa de
 * marcaje y el cliché salen de las mismas funciones que usa el panel
 * (`costeAlTramo`, `quoteMarkingNet`, `desglosarMarcaje`), y el PVP lo pone
 * después `calcular-precios.py` con la regla del encargo (30–31 % sobre venta,
 * redondeo limpio, nunca por debajo del 30 %). Dos implementaciones del mismo
 * precio acaban dando dos precios.
 *
 * Tres reglas que este módulo hace cumplir y conviene no aflojar:
 *
 *   1. El pedido NO lleva proveedor. Ni el nombre, ni `supplierRef`, ni una URL
 *      de su CDN. `construirPedido` lo comprueba sobre el JSON entero con la
 *      misma lista que vigila la web pública (`findSupplierLeak`).
 *   2. Sin tarifa no hay línea. Si la técnica no tiene coste fiable, se para
 *      con el aviso de `quoteMarkingNet` en vez de dejar un 0 que el margen
 *      convertiría en «marcaje gratis».
 *   3. El rol de lectura se comprueba ANTES de leer nada: si puede ver
 *      `CartQuote` o `AdminSetting`, el GRANT se fue de la mano y el script no
 *      sigue. Es la comprobación del final del SQL de acceso, automatizada.
 */
import { CLAVE_MARGENES, margenDeJerarquia, normalizarMargenes, type MargenesPresupuesto } from "@/lib/presupuesto-margenes";
import { MARGEN_OBJETIVO_PCT } from "@/lib/presupuesto-calculo";
import { costeAlTramo, desglosarMarcaje, formatearArea, formatearMedidas } from "@/lib/presupuesto-catalogo";
import { findSupplierLeak, urlDelataProveedor } from "@/lib/supplier-leak-terms";
import { publicProductName } from "@/lib/product-name";
import { publicRef } from "@/lib/internal-ref";

// ── Lo que se pide ───────────────────────────────────────────────────────────

export type DatosPedido = {
  numero: string;
  fecha: string;
  asunto: string | null;
  cliente: { nombre: string; cif: string; direccion: string; contacto: string | null };
  plazo: { min: number; max: number };
  cantidad: number;
  /** Código de técnica del catálogo (p. ej. «MK_P1», «CIF_A»). */
  tecnica: string;
  tintas: number;
  formato: string;
  incluye: string;
  capacidad: string | null;
  nota: string | null;
  /** Ruta local de la foto ya descargada, o null si no la hay. */
  foto: string | null;
};

// ── Lo que devuelve la base de datos (ya filtrado) ───────────────────────────

/** Producto tal y como lo lee el script: el MISMO `select` que el panel. */
export type ProductoLeido = {
  id: string;
  name: string;
  internalRef: string | null;
  material: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  primaryImageUrl: string | null;
  category: {
    name: string;
    parent: { name: string; parent: { name: string } | null } | null;
  } | null;
  override: { customName: string | null } | null;
  variants: Array<{ priceTiers: Array<{ minQty: number; unitPriceCents: number }> }>;
  positions: Array<{
    positionId: string;
    maxWidthMm: number | null;
    maxHeightMm: number | null;
    techniques: Array<{ technique: { code: string; name: string } }>;
  }>;
};

/** Cotización de marcaje ya resuelta por `quoteMarkingNet` para UNA técnica. */
export type MarcajeCotizado = {
  codigo: string;
  nombre: string;
  posicion: string;
  areaMaxima: string | null;
  areaCm2: number | null;
  cotizacion:
    | { ok: true; netTotalCents: number; setupCents: number }
    | { ok: false; warning: string };
};

/**
 * Elige, para cada técnica del producto, la posición de MAYOR área. Es la
 * misma política que la ruta `presupuestos/catalogo/marcaje` y por la misma
 * razón: la tarifa por cm² sube con el área, y cotizar por la pequeña deja
 * corto el presupuesto si el arte va en la grande. Devuelve además esa
 * posición para que la ficha diga la que se ha tarificado, no otra.
 */
export function posicionesPorTecnica(
  posiciones: ProductoLeido["positions"],
): Map<string, { nombre: string; posicion: string; areaCm2: number | null; areaMaxima: string | null }> {
  const porTecnica = new Map<
    string,
    { nombre: string; posicion: string; areaCm2: number | null; areaMaxima: string | null }
  >();
  for (const pos of posiciones) {
    const areaCm2 =
      pos.maxWidthMm && pos.maxHeightMm ? (pos.maxWidthMm * pos.maxHeightMm) / 100 : null;
    for (const { technique } of pos.techniques) {
      const previa = porTecnica.get(technique.code);
      const candidata = {
        nombre: technique.name,
        posicion: pos.positionId,
        areaCm2,
        areaMaxima: formatearArea(pos.maxWidthMm, pos.maxHeightMm),
      };
      if (!previa) porTecnica.set(technique.code, candidata);
      else if (areaCm2 !== null && (previa.areaCm2 === null || areaCm2 > previa.areaCm2)) {
        porTecnica.set(technique.code, { ...candidata, nombre: previa.nombre });
      }
    }
  }
  return porTecnica;
}

/** Rama de categorías de la hoja a la raíz: es lo que decide el margen. */
export function familiasDe(p: ProductoLeido): string[] {
  return [p.category?.name, p.category?.parent?.name, p.category?.parent?.parent?.name].filter(
    (n): n is string => typeof n === "string" && n.trim() !== "",
  );
}

const cent2eur = (c: number) => (c / 100).toFixed(2);

export type PedidoMontable = {
  numero: string;
  fecha: string;
  asunto: string;
  cliente: DatosPedido["cliente"];
  plazo: DatosPedido["plazo"];
  ficha: {
    producto: string;
    ref: string;
    medidas: string;
    materiales: string;
    capacidad?: string;
    incluye: string;
    foto?: string;
  };
  marcaje: { tecnica: string; tintas: string; posicion: string; area: string; formato: string };
  nota?: string;
  lineas: Array<{ concepto: string; detalle?: string; cantidad: number; coste_unit: string }>;
};

export type ResultadoPedido = {
  pedido: PedidoMontable;
  /** Cosas que Mario debe saber antes de emitir. No paran el proceso. */
  avisos: string[];
  /** Lo que el panel aplicaría por familia, para verlo al lado del 30 % del encargo. */
  margenFamiliaPct: number;
};

/**
 * Monta el pedido. Es puro: recibe el producto y la cotización de marcaje ya
 * leídos, y devuelve el JSON o explica por qué no puede.
 */
export function construirPedido(args: {
  datos: DatosPedido;
  producto: ProductoLeido;
  marcaje: MarcajeCotizado;
  margenes: MargenesPresupuesto | null;
}): ResultadoPedido {
  const { datos, producto, marcaje, margenes } = args;
  const avisos: string[] = [];

  // 1) Coste del producto al tramo. Sin tramo no hay línea.
  const tiers = producto.variants[0]?.priceTiers ?? [];
  const coste = costeAlTramo(tiers, datos.cantidad);
  if (!coste) {
    throw new Error(
      `${publicRef(producto)}: el catálogo no tiene tarifa de proveedor para este producto. ` +
        `Pide el coste en el portal y monta el pedido a mano; no se inventa.`,
    );
  }
  if (coste.tramoMinQty > datos.cantidad) {
    // pickTier coge el primer tramo si la cantidad queda por debajo de todos.
    avisos.push(
      `La cantidad (${datos.cantidad}) queda por debajo del primer tramo (${coste.tramoMinQty}). ` +
        `Se cotiza al coste de ese tramo; confirma en el portal que el proveedor sirve esa cantidad.`,
    );
  }

  // 2) Marcaje y cliché. Sin tarifa fiable, se para.
  if (!marcaje.cotizacion.ok) {
    throw new Error(
      `${marcaje.nombre} (${marcaje.codigo}): ${marcaje.cotizacion.warning} ` +
        `Sin tarifa no hay línea de marcaje: no se deja a 0.`,
    );
  }
  const { costeUnitCents: costeMarcaje, clicheCents } = desglosarMarcaje(
    marcaje.cotizacion,
    datos.cantidad,
  );
  if (costeMarcaje <= 0) {
    throw new Error(
      `${marcaje.nombre}: la tarifa devuelve 0 €/ud de marcaje. Revisa los tramos de la técnica antes de emitir.`,
    );
  }

  // 3) El margen que aplicaría el panel por familia. Aquí NO se aplica —el PVP
  //    lo pone calcular-precios.py al 30 % del encargo— pero se enseña, porque
  //    si el panel dice 22 % para gran formato y el PDF sale al 30 %, eso es
  //    una decisión de Mario, no un descuido.
  const familias = familiasDe(producto);
  const margenFamiliaPct = margenes ? margenDeJerarquia(margenes, familias) : MARGEN_OBJETIVO_PCT;
  if (!margenes) {
    avisos.push(
      "No se pudieron leer los márgenes por familia del panel (vista margenes_presupuestos). Se asume el 30 % del encargo.",
    );
  } else if (margenFamiliaPct !== MARGEN_OBJETIVO_PCT) {
    avisos.push(
      `El panel tiene configurado un ${margenFamiliaPct} % para «${familias[0] ?? "esta familia"}»; ` +
        `el PDF saldrá al ${MARGEN_OBJETIVO_PCT} % del encargo. Si quieres el del panel, ajústalo en calcular-precios.py.`,
    );
  }

  // 4) Identidad pública: nombre limpio y referencia STM, nunca la del proveedor.
  const nombre = publicProductName(producto.name, producto.override?.customName);
  const ref = publicRef(producto);
  const medidas = formatearMedidas(producto);
  if (!medidas) avisos.push("El catálogo no trae medidas: la ficha lleva «—». Complétalas del portal.");
  if (!producto.material) avisos.push("El catálogo no trae material: la ficha lleva «—». Complétalo del portal.");
  if (!marcaje.areaMaxima) avisos.push("La posición de marcaje no trae área: la ficha lleva «—».");

  const conceptoMarcaje =
    datos.tintas > 1 ? `${marcaje.nombre} a ${datos.tintas} tintas` : marcaje.nombre;

  const pedido: PedidoMontable = {
    numero: datos.numero,
    fecha: datos.fecha,
    asunto: datos.asunto ?? `Merchandising personalizado · ${nombre}`,
    cliente: datos.cliente,
    plazo: datos.plazo,
    ficha: {
      producto: nombre,
      ref,
      medidas: medidas ?? "—",
      materiales: producto.material ?? "—",
      ...(datos.capacidad ? { capacidad: datos.capacidad } : {}),
      incluye: datos.incluye,
      ...(datos.foto ? { foto: datos.foto } : {}),
    },
    marcaje: {
      tecnica: marcaje.nombre,
      tintas: String(datos.tintas),
      posicion: marcaje.posicion,
      area: marcaje.areaMaxima ?? "—",
      formato: datos.formato,
    },
    ...(datos.nota ? { nota: datos.nota } : {}),
    lineas: [
      {
        concepto: nombre,
        detalle: `Ref. ${ref}${medidas ? ` · ${medidas}` : ""}`,
        cantidad: datos.cantidad,
        coste_unit: cent2eur(coste.costeUnitCents),
      },
      {
        concepto: conceptoMarcaje,
        detalle: `${marcaje.posicion}${marcaje.areaMaxima ? ` · área máx. ${marcaje.areaMaxima}` : ""}`,
        cantidad: datos.cantidad,
        coste_unit: cent2eur(costeMarcaje),
      },
      {
        concepto: `Cliché / pantalla · ${marcaje.nombre}`,
        detalle: "Cargo único por diseño y color",
        cantidad: 1,
        coste_unit: cent2eur(clicheCents),
      },
    ],
  };

  // 5) Última puerta: nada del proveedor sale en el JSON.
  const texto = JSON.stringify(pedido);
  const fuga = findSupplierLeak(texto);
  if (fuga) {
    throw new Error(
      `El pedido nombra al proveedor («${fuga}»). Revisa nombre, material o posición en el catálogo; no se emite así.`,
    );
  }
  if (pedido.ficha.foto && /^https?:/i.test(pedido.ficha.foto) && urlDelataProveedor(pedido.ficha.foto)) {
    throw new Error("La foto apunta al CDN del proveedor. Descárgala en local antes de montar el PDF.");
  }

  return { pedido, avisos, margenFamiliaPct };
}

// ── Comprobación del rol ─────────────────────────────────────────────────────

export type ComprobacionRol = { ok: true } | { ok: false; motivo: string };

/**
 * El rol de lectura NO debe poder leer clientes ni ajustes. Se comprueba
 * intentando leerlos: lo esperado es «permission denied». Si alguna de las dos
 * lecturas FUNCIONA, el GRANT es más ancho de lo pactado y no se sigue.
 *
 * Se pasa el cliente para poder probarlo sin base de datos.
 */
export async function comprobarRolDeLectura(db: {
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
}): Promise<ComprobacionRol> {
  const prohibidas = ['"CartQuote"', '"AdminSetting"', '"CustomerUser"', '"Payment"'];
  const visibles: string[] = [];
  for (const tabla of prohibidas) {
    try {
      await db.$queryRawUnsafe(`SELECT 1 FROM ${tabla} LIMIT 1`);
      visibles.push(tabla);
    } catch {
      // Lo esperado.
    }
  }
  if (visibles.length > 0) {
    return {
      ok: false,
      motivo:
        `El rol puede leer ${visibles.join(", ")}. Eso no es el acceso de solo catálogo que se pactó: ` +
        `revisa el GRANT (docs/acceso-lectura-claude.sql) antes de seguir.`,
    };
  }
  return { ok: true };
}

/** Lee los márgenes por la vista; null si la vista no existe o no se puede leer. */
export async function leerMargenesPorVista(db: {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
}): Promise<MargenesPresupuesto | null> {
  try {
    const filas = (await db.$queryRaw`SELECT value FROM margenes_presupuestos WHERE key = ${CLAVE_MARGENES}`) as Array<{
      value: unknown;
    }>;
    return normalizarMargenes(filas[0]?.value);
  } catch {
    return null;
  }
}

// ── argv ─────────────────────────────────────────────────────────────────────

/**
 * Busca el valor de una opción en argv, aceptando `--nombre` y `-nombre`.
 *
 * Las dos formas porque la cabecera del script documenta `-o fichero.json` y
 * durante el ensayo del 09-sep se vio que solo se leía `--o`: el fichero no se
 * escribía y el pedido salía por pantalla SIN decir nada. Un fallo mudo, que es
 * el peor: parece que ha ido bien y el JSON se pierde en el scroll.
 *
 * Pura y exportada para poder probarla sin montar un argv de verdad.
 */
export function leerArgumento(argv: readonly string[], nombre: string, porDefecto?: string): string | undefined {
  for (const forma of [`--${nombre}`, `-${nombre}`]) {
    const i = argv.indexOf(forma);
    if (i !== -1 && i + 1 < argv.length) return argv[i + 1];
  }
  return porDefecto;
}

/** ¿Está presente la bandera? Acepta `--nombre` y `-nombre`, como `leerArgumento`. */
export function hayBandera(argv: readonly string[], nombre: string): boolean {
  return argv.includes(`--${nombre}`) || argv.includes(`-${nombre}`);
}
