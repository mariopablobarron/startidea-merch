import type { BroadcastAudience } from "@prisma/client";
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

export async function resolveAudience(
  audience: BroadcastAudience,
): Promise<Recipient[]> {
  if (audience === "NEWSLETTER_ALL") {
    const subs = await prisma.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null },
      select: { email: true, name: true, unsubscribeToken: true },
    });
    return subs.map((s) => ({
      email: s.email,
      name: s.name,
      unsubscribeToken: s.unsubscribeToken,
    }));
  }

  if (audience === "NEWSLETTER_NEW") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const subs = await prisma.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null, optedInAt: { gte: since } },
      select: { email: true, name: true, unsubscribeToken: true },
    });
    return subs.map((s) => ({
      email: s.email,
      name: s.name,
      unsubscribeToken: s.unsubscribeToken,
    }));
  }

  if (audience === "CUSTOMERS_ALL") {
    const customers = await prisma.customerUser.findMany({
      select: { email: true, name: true },
    });
    return dedup(customers.map((c) => ({ email: c.email, name: c.name, unsubscribeToken: "" })));
  }

  if (audience === "CART_QUOTES_RECENT") {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
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
export async function estimateAudienceSize(audience: BroadcastAudience): Promise<number> {
  if (audience === "NEWSLETTER_ALL") {
    return prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } });
  }
  if (audience === "NEWSLETTER_NEW") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return prisma.newsletterSubscriber.count({
      where: { unsubscribedAt: null, optedInAt: { gte: since } },
    });
  }
  if (audience === "CUSTOMERS_ALL") {
    return prisma.customerUser.count();
  }
  if (audience === "CART_QUOTES_RECENT") {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await prisma.cartQuote.findMany({
      where: { email: { not: "" }, createdAt: { gte: since } },
      select: { email: true },
      distinct: ["email"],
    });
    return rows.length;
  }
  return 0;
}

export const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  NEWSLETTER_ALL: "Newsletter — todos los suscriptores",
  NEWSLETTER_NEW: "Newsletter — nuevos (últimos 30 días)",
  CUSTOMERS_ALL: "Clientes — todos con cuenta",
  CART_QUOTES_RECENT: "Leads — cotizaciones últimos 90 días",
};
