import type { BroadcastAudience, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Resuelve la audiencia de un broadcast a una lista de destinatarios.
 * Devuelve siempre dedup-by-email (no se envía 2 veces al mismo).
 *
 * El campo `unsubscribeToken` solo aplica a NewsletterSubscriber. Para
 * CustomerUsers y CartQuotes generamos un token estable por email para
 * que el footer del email tenga link de baja válido.
 */
export type Recipient = {
  email: string;
  name?: string | null;
  // token usado en /api/newsletter/unsubscribe?token=…
  unsubscribeToken: string;
};

const DAY = 24 * 60 * 60 * 1000;

// Ventana para "dormidos": alta hace más de N días y sin apertura reciente.
const DORMANT_DAYS = 60;

const SUB_SELECT = { email: true, name: true, unsubscribeToken: true } as const;

/**
 * Construye el filtro Prisma de NewsletterSubscriber según la audiencia.
 * Devuelve null para audiencias que no son de newsletter.
 */
function newsletterWhere(
  audience: BroadcastAudience,
  audienceTags: string[],
  audienceSource: string | null,
): Prisma.NewsletterSubscriberWhereInput | null {
  const base: Prisma.NewsletterSubscriberWhereInput = { unsubscribedAt: null };
  switch (audience) {
    case "NEWSLETTER_ALL":
      return base;
    case "NEWSLETTER_NEW":
      return { ...base, optedInAt: { gte: new Date(Date.now() - 30 * DAY) } };
    case "NEWSLETTER_TAG":
      return audienceTags.length ? { ...base, tags: { hasSome: audienceTags } } : null;
    case "NEWSLETTER_ENGAGED":
      return { ...base, engagementScore: { gte: 1 } };
    case "NEWSLETTER_DORMANT": {
      const cutoff = new Date(Date.now() - DORMANT_DAYS * DAY);
      return {
        ...base,
        optedInAt: { lte: cutoff },
        OR: [{ lastOpenedAt: null }, { lastOpenedAt: { lte: cutoff } }],
      };
    }
    case "NEWSLETTER_SOURCE":
      return audienceSource ? { ...base, source: audienceSource } : null;
    default:
      return null;
  }
}

export async function resolveAudience(
  audience: BroadcastAudience,
  audienceTags: string[] = [],
  audienceSource: string | null = null,
): Promise<Recipient[]> {
  const where = newsletterWhere(audience, audienceTags, audienceSource);
  if (where) {
    const subs = await prisma.newsletterSubscriber.findMany({ where, select: SUB_SELECT });
    return subs.map((s) => ({ email: s.email, name: s.name, unsubscribeToken: s.unsubscribeToken }));
  }

  if (audience === "CUSTOMERS_ALL") {
    const customers = await prisma.customerUser.findMany({ select: { email: true, name: true } });
    return dedup(customers.map((c) => ({ email: c.email, name: c.name, unsubscribeToken: "" })));
  }

  if (audience === "CART_QUOTES_RECENT") {
    const since = new Date(Date.now() - 90 * DAY);
    const carts = await prisma.cartQuote.findMany({
      where: { email: { not: "" }, createdAt: { gte: since } },
      select: { email: true, name: true },
      distinct: ["email"],
    });
    return dedup(carts.map((c) => ({ email: c.email, name: c.name, unsubscribeToken: "" })));
  }

  return [];
}

function dedup(list: Recipient[]): Recipient[] {
  const map = new Map<string, Recipient>();
  for (const r of list) {
    const key = r.email.toLowerCase();
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values());
}

/**
 * Estima el tamaño de la audiencia sin cargar todos los registros.
 * Para mostrar "Se enviará a X destinatarios" en la UI antes de pulsar.
 */
export async function estimateAudienceSize(
  audience: BroadcastAudience,
  audienceTags: string[] = [],
  audienceSource: string | null = null,
): Promise<number> {
  const where = newsletterWhere(audience, audienceTags, audienceSource);
  if (where) return prisma.newsletterSubscriber.count({ where });

  if (audience === "CUSTOMERS_ALL") return prisma.customerUser.count();
  if (audience === "CART_QUOTES_RECENT") {
    const since = new Date(Date.now() - 90 * DAY);
    const rows = await prisma.cartQuote.findMany({
      where: { email: { not: "" }, createdAt: { gte: since } },
      select: { email: true },
      distinct: ["email"],
    });
    return rows.length;
  }
  return 0;
}

/**
 * Lista los orígenes (source) de subscribers activos, con conteo, para el
 * selector de la audiencia NEWSLETTER_SOURCE en el editor.
 */
export async function listSources(): Promise<{ source: string; count: number }[]> {
  const groups = await prisma.newsletterSubscriber.groupBy({
    by: ["source"],
    where: { unsubscribedAt: null, source: { not: null } },
    _count: { _all: true },
  });
  return groups
    .map((g) => ({ source: g.source as string, count: g._count._all }))
    .filter((g) => Boolean(g.source))
    .sort((a, b) => b.count - a.count);
}

export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  NEWSLETTER_ALL: "Newsletter — todos los suscriptores",
  NEWSLETTER_NEW: "Newsletter — nuevos (últimos 30 días)",
  NEWSLETTER_TAG: "Newsletter — por tag(s) específicos",
  NEWSLETTER_ENGAGED: "Newsletter — activos (han abierto algún email)",
  NEWSLETTER_DORMANT: "Newsletter — dormidos (reactivación)",
  NEWSLETTER_SOURCE: "Newsletter — por origen",
  CUSTOMERS_ALL: "Clientes — todos con cuenta",
  CART_QUOTES_RECENT: "Leads — cotizaciones últimos 90 días",
};
