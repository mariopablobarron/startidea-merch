/**
 * La aritmética de un presupuesto de merchandising. Pura, sin Prisma: es la
 * parte donde un error se cobra o se deja de cobrar.
 *
 * Reglas del encargo, todas aquí y en un solo sitio:
 *
 *   · Margen del **30 % sobre el precio de venta** (no sobre el coste):
 *     `PVP = coste ÷ 0,70`. Es editable por línea, por presupuesto y por
 *     familia de producto; el 30 % es el valor inicial, no una constante.
 *   · Los precios unitarios se redondean a cifras que se lean bien
 *     manteniendo el margen **entre el 30 % y el 31 %**.
 *   · El IVA del 21 % va SIEMPRE desglosado aparte de la base imponible.
 *   · Producto, marcaje y cliché son líneas distintas: el cliente tiene que
 *     ver de dónde sale el importe. Los cargos únicos (cliché, pantalla,
 *     fotolito) no se prorratean.
 *
 * Ojo con la palabra «margen»: el sitio público usa `MARGIN_MULTIPLIER`
 * (×1,6667), que es un **markup sobre el coste** del 66 %, equivalente a un
 * 40 % sobre venta. Aquí se habla siempre de margen sobre VENTA y por eso no
 * se reutiliza `applyMargin`: confundirlos es un 10 % de diferencia en cada
 * línea.
 */

import { IVA_RATE, ivaPart } from "@/lib/iva";

/** Margen inicial del encargo, en % sobre el precio de venta. */
export const MARGEN_OBJETIVO_PCT = 30;

/**
 * Cuánto se le deja subir al redondeo por encima del margen objetivo.
 *
 * Es un ANCHO, no un techo fijo. Con un techo absoluto del 31 % el redondeo
 * ignoraba el margen que se le pedía: una línea al 22 % aceptaba como buena la
 * cifra limpia que dejaba un 30 %, y una al 40 % no encontraba ninguna cifra
 * dentro de banda y se quedaba sin redondear. Desde que el margen por familia
 * manda de verdad, la banda tiene que moverse con él.
 */
export const MARGEN_BANDA_REDONDEO_PCT = 1;

/** Por debajo de esto el panel avisa: la línea se está vendiendo demasiado justa. */
export const MARGEN_AVISO_PCT = 20;

/** PVP exacto (céntimos) para un coste y un margen sobre venta. */
export function pvpDesdeCoste(costeCents: number, margenPct: number): number {
  if (!Number.isFinite(costeCents) || costeCents <= 0) return 0;
  const m = Math.min(Math.max(margenPct, 0), 99.9) / 100;
  return Math.round(costeCents / (1 - m));
}

/** Margen REAL de una línea, en % sobre el precio de venta. */
export function margenResultantePct(costeCents: number, pvpCents: number): number {
  if (!Number.isFinite(pvpCents) || pvpCents <= 0) return 0;
  return ((pvpCents - costeCents) / pvpCents) * 100;
}

/**
 * Redondea el PVP a una cifra limpia SIN bajar del margen objetivo.
 *
 * Se prueban pasos de mayor a menor (100 €, 50 €, 10 €, 5 €, 1 €, 50 c, 10 c,
 * 5 c, 1 c) y se coge el más grueso cuyo margen siga dentro de la banda —del
 * objetivo a un punto por encima—: para un coste de 243 € al 30 % el exacto son
 * 347,14 € y sale 350,00 €, no 348,00 €. Nunca redondea a la baja:
 * un céntimo de menos por unidad son 20 € en una tirada de 2.000, y siempre en
 * nuestra contra.
 *
 * Si ningún paso cabe en la banda —pasa con precios de pocos céntimos, donde
 * un céntimo ya es más de un punto de margen— devuelve el PVP exacto redondeado
 * al céntimo hacia arriba. El margen resultante se enseña siempre en el panel,
 * así que la desviación se ve, no se esconde.
 */
export function redondearPvpLimpio(
  costeCents: number,
  margenObjetivoPct: number = MARGEN_OBJETIVO_PCT,
  margenMaximoPct: number = margenObjetivoPct + MARGEN_BANDA_REDONDEO_PCT,
): number {
  const exacto = pvpDesdeCoste(costeCents, margenObjetivoPct);
  if (exacto <= 0) return 0;

  // De más grueso a más fino: 100 €, 50 €, 10 €, 5 €, 1 €, 50 c, 10 c, 5 c, 1 c.
  for (const paso of [10000, 5000, 1000, 500, 100, 50, 10, 5, 1]) {
    const candidato = Math.ceil(exacto / paso) * paso;
    const margen = margenResultantePct(costeCents, candidato);
    if (margen >= margenObjetivoPct - 0.01 && margen <= margenMaximoPct) return candidato;
  }
  return exacto;
}

export type TipoLinea = "PRODUCTO" | "MARCAJE" | "CLICHE" | "OTRO";

export type LineaCalculo = {
  tipo: TipoLinea;
  cantidad: number;
  costeUnitCents: number;
  pvpUnitCents: number;
};

export type LineaTotales = {
  costeCents: number;
  importeCents: number;
  margenCents: number;
  margenPct: number;
  avisoMargen: boolean;
};

/** Totales de una línea. La cantidad multiplica también a los cargos únicos: un
 * cliché es una línea de cantidad 1, no un importe repartido entre unidades. */
export function calcularLinea(linea: LineaCalculo): LineaTotales {
  const cantidad = Math.max(0, Math.trunc(linea.cantidad));
  const costeCents = linea.costeUnitCents * cantidad;
  const importeCents = linea.pvpUnitCents * cantidad;
  const margenCents = importeCents - costeCents;
  const margenPct = margenResultantePct(costeCents, importeCents);
  return {
    costeCents,
    importeCents,
    margenCents,
    margenPct,
    // Una línea sin importe no "tiene poco margen": no tiene precio todavía.
    avisoMargen: importeCents > 0 && margenPct < MARGEN_AVISO_PCT,
  };
}

export type OpcionTotales = {
  costeCents: number;
  baseCents: number;
  ivaCents: number;
  totalCents: number;
  margenCents: number;
  margenPct: number;
  lineasBajoMargen: number;
};

/** Suma de una opción (o de una partida sin alternativas): base, IVA y total. */
export function calcularOpcion(lineas: LineaCalculo[]): OpcionTotales {
  let costeCents = 0;
  let baseCents = 0;
  let lineasBajoMargen = 0;
  for (const linea of lineas) {
    const t = calcularLinea(linea);
    costeCents += t.costeCents;
    baseCents += t.importeCents;
    if (t.avisoMargen) lineasBajoMargen++;
  }
  const ivaCents = ivaPart(baseCents);
  return {
    costeCents,
    baseCents,
    ivaCents,
    totalCents: baseCents + ivaCents,
    margenCents: baseCents - costeCents,
    margenPct: margenResultantePct(costeCents, baseCents),
    lineasBajoMargen,
  };
}

export type OpcionCalculo = {
  id: string;
  nombre: string;
  recomendada: boolean;
  lineas: LineaCalculo[];
};

export type PartidaCalculo = {
  id: string;
  titulo: string;
  opciones: OpcionCalculo[];
};

export type Escenario = {
  /** Etiqueta del bloque de totales: «Total», «Total con opción A · Yonrax»… */
  etiqueta: string;
  /** Opción elegida en cada partida (id de partida → id de opción). */
  seleccion: Record<string, string>;
  totales: OpcionTotales;
  recomendado: boolean;
};

/** La opción recomendada de una partida, o la primera si ninguna lo está. */
function opcionPorDefecto(partida: PartidaCalculo): OpcionCalculo | undefined {
  return partida.opciones.find((o) => o.recomendada) ?? partida.opciones[0];
}

/**
 * Los bloques de totales que lleva el documento.
 *
 * Con una partida de dos calidades salen dos totales («Total con opción A»,
 * «Total con opción B»), cada uno sumando esa opción más lo recomendado del
 * resto — que es exactamente lo que el cliente compara.
 *
 * Deliberadamente NO se hace el producto cartesiano de todas las alternativas:
 * con dos partidas de dos opciones serían cuatro bloques de totales en una
 * página que tiene sitio para dos, y un cliente que ya no compara nada. Si hay
 * varias partidas con alternativas, se varía la primera y el resto va en su
 * opción recomendada.
 */
export function calcularEscenarios(partidas: PartidaCalculo[]): Escenario[] {
  const fijas = (excepto?: string) =>
    partidas
      .filter((p) => p.id !== excepto)
      .flatMap((p) => opcionPorDefecto(p)?.lineas ?? []);

  const conAlternativas = partidas.find((p) => p.opciones.length > 1);

  if (!conAlternativas) {
    const seleccion: Record<string, string> = {};
    for (const p of partidas) {
      const o = opcionPorDefecto(p);
      if (o) seleccion[p.id] = o.id;
    }
    return [
      {
        etiqueta: "Total",
        seleccion,
        totales: calcularOpcion(fijas()),
        recomendado: true,
      },
    ];
  }

  const restoLineas = fijas(conAlternativas.id);
  return conAlternativas.opciones.map((opcion, i) => {
    const seleccion: Record<string, string> = { [conAlternativas.id]: opcion.id };
    for (const p of partidas) {
      if (p.id === conAlternativas.id) continue;
      const o = opcionPorDefecto(p);
      if (o) seleccion[p.id] = o.id;
    }
    const letra = String.fromCharCode(65 + i); // A, B, C…
    return {
      etiqueta: `Total con opción ${letra} · ${opcion.nombre}`,
      seleccion,
      totales: calcularOpcion([...restoLineas, ...opcion.lineas]),
      // Una sola recomendación: si vinieran dos marcadas, manda la primera,
      // igual que en el documento.
      recomendado: opcion === opcionPorDefecto(conAlternativas),
    };
  });
}

/** Tipo de IVA aplicado, para que el documento y el panel digan lo mismo. */
export const IVA_PCT = Math.round(IVA_RATE * 100);
