import type { TimelineEvent } from "@/components/OrderTimeline";

/**
 * Construye los eventos del timeline a partir del CartQuote.
 * Reusable entre admin (/admin/cart-quotes/[id]) y portal cliente
 * (/clientes/page.tsx).
 */
export type CartForTimeline = {
  createdAt: string | Date;
  status: string;
  confirmedAt?: string | Date | null;
  orderedAt?: string | Date | null;
  payments?: Array<{ paidAt?: string | Date | null; amountCents: number }>;
  proofs?: Array<{ status: string; decidedAt?: string | Date | null }>;
  trackings?: Array<{
    status?: string | null;
    trackingCode?: string | null;
    carrier?: string | null;
    fetchedAt?: string | Date | null;
  }>;
};

export function buildCartTimelineEvents(cart: CartForTimeline): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({ stage: "RECEIVED", at: cart.createdAt });

  if (
    cart.status === "IN_PROGRESS" ||
    cart.status === "SENT" ||
    cart.status === "CONFIRMED" ||
    cart.status === "ORDERED"
  ) {
    events.push({ stage: "REVIEWING", at: cart.createdAt });
  }

  if (cart.status === "SENT" || cart.status === "CONFIRMED" || cart.status === "ORDERED") {
    events.push({ stage: "QUOTE_SENT", at: cart.createdAt });
  }

  // Pago confirmado
  const firstPayment = cart.payments?.find((p) => p.paidAt);
  if (firstPayment?.paidAt) {
    events.push({
      stage: "PAID",
      at: firstPayment.paidAt,
      details: `${(firstPayment.amountCents / 100).toFixed(2)} €`,
    });
  }

  // Mockup aprobado
  const approvedProof = cart.proofs?.find((p) => p.status === "APPROVED");
  if (approvedProof?.decidedAt) {
    events.push({ stage: "PROOF_APPROVED", at: approvedProof.decidedAt });
  }

  // En producción
  if (cart.orderedAt) {
    events.push({ stage: "IN_PRODUCTION", at: cart.orderedAt });
  }

  // Envío / entrega
  const lastTracking = cart.trackings?.[0];
  if (lastTracking?.status) {
    if (/deliver|entreg/i.test(lastTracking.status)) {
      events.push({
        stage: "DELIVERED",
        at: lastTracking.fetchedAt ?? null,
        details: lastTracking.trackingCode || undefined,
      });
    } else if (/ship|env[ií]/i.test(lastTracking.status) || lastTracking.trackingCode) {
      events.push({
        stage: "SHIPPED",
        at: lastTracking.fetchedAt ?? null,
        details: lastTracking.trackingCode
          ? `${lastTracking.carrier || "Tracking"} ${lastTracking.trackingCode}`
          : undefined,
      });
    }
  }

  return events;
}
