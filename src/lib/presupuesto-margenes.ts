/**
 * Margen por familia de producto, editable desde el panel.
 *
 * El 30 % sobre venta del encargo es el punto de partida, no una constante:
 * el gran formato se cotiza con el PVP recomendado del portal (que ya lleva su
 * margen) y hay familias donde el mercado no aguanta el mismo punto. Vive en
 * `AdminSetting` (clave/valor JSON) para no añadir una tabla a un ajuste que
 * son cuatro números.
 */

import { prisma } from "@/lib/prisma";
import { MARGEN_OBJETIVO_PCT } from "@/lib/presupuesto-calculo";

export const CLAVE_MARGENES = "presupuestos.margenes";

export type MargenesPresupuesto = {
  /** Margen por defecto cuando la familia no tiene el suyo. */
  pordefecto: number;
  /** Familia (en minúsculas) → margen sobre venta. */
  familias: Record<string, number>;
};

export const MARGENES_POR_DEFECTO: MargenesPresupuesto = {
  pordefecto: MARGEN_OBJETIVO_PCT,
  familias: {},
};

function esMargenValido(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 95;
}

/** Normaliza lo que haya en BD: un valor corrupto no puede tumbar el panel. */
export function normalizarMargenes(valor: unknown): MargenesPresupuesto {
  if (!valor || typeof valor !== "object") return MARGENES_POR_DEFECTO;
  const v = valor as Partial<MargenesPresupuesto>;
  const familias: Record<string, number> = {};
  if (v.familias && typeof v.familias === "object") {
    for (const [familia, margen] of Object.entries(v.familias)) {
      const clave = familia.trim().toLowerCase();
      if (clave && esMargenValido(margen)) familias[clave] = margen;
    }
  }
  return {
    pordefecto: esMargenValido(v.pordefecto) ? v.pordefecto : MARGEN_OBJETIVO_PCT,
    familias,
  };
}

export async function leerMargenes(): Promise<MargenesPresupuesto> {
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: CLAVE_MARGENES } });
    return normalizarMargenes(row?.value);
  } catch {
    // En build o sin BD, el encargo manda: 30 %.
    return MARGENES_POR_DEFECTO;
  }
}

export async function guardarMargenes(margenes: MargenesPresupuesto): Promise<MargenesPresupuesto> {
  const limpio = normalizarMargenes(margenes);
  await prisma.adminSetting.upsert({
    where: { key: CLAVE_MARGENES },
    create: { key: CLAVE_MARGENES, value: limpio },
    update: { value: limpio },
  });
  return limpio;
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Margen configurado para una familia, o null si esa familia no tiene el suyo.
 *
 * Se compara en minúsculas y sin acentos para que «Vasos», «vasos» y «VASOS»
 * sean la misma: el nombre lo teclea una persona en el panel y la categoría
 * viene del feed, y no van a coincidir carácter a carácter.
 */
export function margenDeFamilia(
  margenes: MargenesPresupuesto,
  familia?: string | null,
): number | null {
  if (!familia) return null;
  const clave = familia.trim().toLowerCase();
  if (clave in margenes.familias) return margenes.familias[clave];
  const pelada = sinAcentos(clave);
  for (const [k, v] of Object.entries(margenes.familias)) {
    if (sinAcentos(k) === pelada) return v;
  }
  return null;
}

/**
 * Margen que toca a un producto, mirando su rama de categorías de la hoja
 * hacia la raíz.
 *
 * El orden importa: si hay un margen para «Vasos» y otro para «Bebida», manda
 * el de «Vasos», que es lo más concreto. Sin ninguno, el margen por defecto.
 */
export function margenDeJerarquia(
  margenes: MargenesPresupuesto,
  familias: Array<string | null | undefined>,
): number {
  for (const familia of familias) {
    const margen = margenDeFamilia(margenes, familia);
    if (margen !== null) return margen;
  }
  return margenes.pordefecto;
}
