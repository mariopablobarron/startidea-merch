import { prisma } from "@/lib/prisma";

/**
 * Ruleta de premios del popup de captación (lead magnet gamificado).
 *
 * Decisiones de negocio (Mario, 2026-06-22):
 *  - La ruleta SIEMPRE premia, así que cada gajo es barato (perk de coste ~0)
 *    o con margen acotado (% o importe fijo). Los baratos pesan más.
 *  - El premio se elige en el SERVIDOR (no se confía en el cliente).
 *  - Una tirada por email: si el email ya tiró, se le devuelve SU premio.
 *  - Sin modelo nuevo: el lead vive en NewsletterSubscriber (source/tags/meta)
 *    y el descuento, si aplica, es un Coupon real de un solo uso a 30 días.
 *
 * Los premios son editables sin tocar código vía AdminSetting key "ruleta_config"
 * con forma { prizes: RuletaPrize[] }.
 */

export type RuletaPrizeKind = "perk" | "percent" | "fixed";

export interface RuletaPrize {
  /** slug estable: usado en tag (`ruleta:<id>`) y prefijo de código */
  id: string;
  /** etiqueta completa que ve el usuario */
  label: string;
  /** etiqueta corta para el gajo de la ruleta */
  short: string;
  kind: RuletaPrizeKind;
  /** peso de selección (mayor = sale más). 0 lo desactiva sin borrarlo */
  weight: number;
  /** percent: 1-100 · fixed: céntimos de descuento */
  value?: number;
  /** total mínimo de carrito (céntimos) para que el cupón aplique */
  minTotalCents?: number;
  /** instrucción para premios "perk" (sin cupón): se cumple manualmente */
  perkNote?: string;
}

/** Mezcla por defecto. Baratos (perk) pesan más; los caros salen poco. */
export const DEFAULT_RULETA_PRIZES: RuletaPrize[] = [
  {
    id: "mockup",
    label: "Mockup de diseño gratis",
    short: "Mockup gratis",
    kind: "perk",
    weight: 3,
    perkNote:
      "Respóndenos a este email con tu logo o idea y te preparamos un mockup de tu producto sin coste.",
  },
  {
    id: "sorteo",
    label: "Entras en el sorteo del mes",
    short: "Sorteo",
    kind: "perk",
    weight: 3,
    perkNote:
      "Ya estás dentro del sorteo de este mes. Anunciamos al ganador por email a fin de mes.",
  },
  {
    id: "p5",
    label: "5% en tu primer pedido",
    short: "5% dto.",
    kind: "percent",
    weight: 2,
    value: 5,
  },
  {
    id: "regalo",
    label: "Regalo sorpresa con tu pedido",
    short: "Regalo",
    kind: "perk",
    weight: 2,
    perkNote:
      "Incluiremos un detalle sorpresa en tu primer pedido. Solo menciona este email al confirmarlo.",
  },
  {
    id: "envio",
    label: "Envío gratis en tu primer pedido",
    short: "Envío gratis",
    kind: "fixed",
    weight: 1,
    value: 590,
    minTotalCents: 3000,
  },
  {
    id: "p10",
    label: "10% en tu primer pedido",
    short: "10% dto.",
    kind: "percent",
    weight: 1,
    value: 10,
  },
];

/** Lee la config de premios desde AdminSetting; si no hay, usa los defaults. */
export async function getRuletaPrizes(): Promise<RuletaPrize[]> {
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: "ruleta_config" } });
    const val = row?.value as { prizes?: RuletaPrize[] } | null;
    if (val && Array.isArray(val.prizes) && val.prizes.length > 0) {
      return val.prizes.filter((p) => p && p.id && (p.weight ?? 0) > 0);
    }
  } catch {
    // sin config → defaults
  }
  return DEFAULT_RULETA_PRIZES;
}

/** Elige un premio por peso. Usa Math.random salvo que se pase un seed. */
export function pickPrize(prizes: RuletaPrize[], seed?: number): RuletaPrize {
  const pool = prizes.filter((p) => (p.weight ?? 0) > 0);
  if (pool.length === 0) return prizes[0];
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = seed != null ? seed % total : Math.floor(Math.random() * total);
  for (const p of pool) {
    r -= p.weight;
    if (r < 0) return p;
  }
  return pool[pool.length - 1];
}

/** Genera un código de cupón único y legible para un premio. */
export function generateCouponCode(prizeId: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RUL-${prizeId.toUpperCase()}-${rand}`;
}
