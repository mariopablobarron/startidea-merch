/**
 * «Desde X €/ud» CON marcaje para la ficha de producto.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * La ficha anunciaba «Desde 0,13 €/ud» y ese precio es el del producto **sin
 * personalizar**. Un vaso de 0,13 € marcado a una tinta en 2.000 unidades sale
 * a 0,243 € de coste: la serigrafía cuesta más que el vaso. El cliente pedía
 * presupuesto con un número en la cabeza y recibía otro; el comercial perdía la
 * venta explicando la diferencia.
 *
 * Aquí se calcula el segundo número, con el MISMO pipeline que el carrito y el
 * checkout (`computeServerLinePricing`), para que la ficha no pueda divergir de
 * lo que se cobra.
 *
 * ── A qué cantidad ──────────────────────────────────────────────────────────
 * A la del tramo que produce ese «desde», que es el tramo más barato y por
 * tanto el de MÁS unidades. Es la única cantidad a la que los dos números son
 * comparables, y además es donde el cliché queda repartido y no distorsiona el
 * unitario. Comparar el «desde» de 5.000 uds con un marcaje calculado sobre 1
 * unidad sería honesto y a la vez inútil.
 */

import { loadActivePromotions } from "@/lib/promotions";
import { computeServerLinePricing } from "@/lib/quote-server-pricing";
import type { PriceTier } from "@/lib/pricing";

export type ReferenciaMarcaje = {
  /** Cantidad a la que se calcula (la del tramo del «desde»). */
  quantity: number;
  positionId: string;
  techniqueCode: string;
};

type PosicionMin = {
  positionId: string;
  techniques: Array<{ isDefault: boolean; technique: { code: string } }>;
};

/**
 * Elige a qué cantidad, en qué zona y con qué técnica se calcula la referencia.
 * Puro y testeado: es la parte donde se puede elegir mal.
 */
export function elegirReferenciaMarcaje(args: {
  tiers: PriceTier[] | undefined;
  positions: PosicionMin[];
}): ReferenciaMarcaje | null {
  const { tiers, positions } = args;
  if (!tiers || tiers.length === 0) return null;

  // El tramo del «desde» es el más barato. Con empate, el de menos unidades:
  // prometer menos cantidad es el error seguro.
  const tramo = [...tiers].sort(
    (a, b) => a.unitPriceCents - b.unitPriceCents || a.minQty - b.minQty,
  )[0];
  if (!tramo || tramo.minQty < 1) return null;

  const posicion = positions.find((p) => p.techniques.length > 0);
  if (!posicion) return null;

  const tecnica =
    posicion.techniques.find((t) => t.isDefault)?.technique.code ??
    posicion.techniques[0].technique.code;

  return { quantity: tramo.minQty, positionId: posicion.positionId, techniqueCode: tecnica };
}

export type DesdeConMarcaje = {
  unitCents: number;
  quantity: number;
};

/**
 * Devuelve el unitario con marcaje a una tinta, o `null` si no se puede
 * calcular con tarifa fiable.
 *
 * `null` es una respuesta legítima y frecuente (producto sin posiciones, sin
 * tramo aplicable, técnica sin tarifa). Antes que enseñar un número inventado,
 * la ficha no enseña nada: el texto de «el marcaje se presupuesta aparte» ya
 * cuenta lo esencial.
 */
export async function fromPriceWithMarking(args: {
  productSlug: string;
  tiers: PriceTier[] | undefined;
  positions: PosicionMin[];
  activePromos?: Awaited<ReturnType<typeof loadActivePromotions>>;
}): Promise<DesdeConMarcaje | null> {
  const ref = elegirReferenciaMarcaje({ tiers: args.tiers, positions: args.positions });
  if (!ref) return null;

  const promos = args.activePromos ?? (await loadActivePromotions());
  const pricing = await computeServerLinePricing(
    {
      productSlug: args.productSlug,
      quantity: ref.quantity,
      markings: [
        {
          techniqueCode: ref.techniqueCode,
          positionId: ref.positionId,
          numberOfColours: 1,
        },
      ],
    },
    promos,
  );

  if (!pricing.ok || pricing.unitClientCents <= 0) return null;
  return { unitCents: pricing.unitClientCents, quantity: ref.quantity };
}
