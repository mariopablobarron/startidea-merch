/**
 * Cuándo un CartQuote es candidato a recibir la invitación a review.
 *
 * Antes de este fix, el cron invitaba a los 7 días de PAGAR el pedido
 * (CartQuote.orderedAt), no de que llegara — en merchandising personalizado
 * (producción + envío) eso suele ser ANTES de la entrega real. El email
 * encima afirmaba "hace una semana entregamos tu pedido": una mentira
 * automatizada si el pedido seguía en producción.
 *
 * PurchaseOrder.deliveredAt se marca A MANO por un admin (no hay webhook de
 * transportista) — no puede ser el ÚNICO disparador o la campaña se queda a
 * cero en cuanto alguien se olvide de marcar una entrega. Cascada:
 *
 *   1. Todos los PO del cart entregados (deliveredAt) → señal real, mejor caso.
 *   2. Sin PO en absoluto (flujo antiguo/manual) → fallback por tiempo desde
 *      el pago, con margen realista de producción+envío.
 *   3. Con PO pero sin entrega confirmada → NO invitar todavía, salvo que
 *      lleve tanto tiempo que algo probablemente se coló sin marcar
 *      (válvula de seguridad, mismo fallback largo que el caso 2).
 */

const DAYS_AFTER_DELIVERY = 5; // margen para que el cliente USE el producto
const FALLBACK_DAYS_NO_SIGNAL = 21; // sin señal de entrega: plazo realista producción+envío
const FALLBACK_DAYS_STUCK = 45; // válvula de seguridad si algo quedó sin marcar

export type CartEligibilityInput = {
  orderedAt: Date;
  purchaseOrders: Array<{ status: string; deliveredAt: Date | null }>;
};

export type EligibilityResult =
  | { eligible: false }
  | { eligible: true; signal: "delivered"; deliveredAt: Date }
  | { eligible: true; signal: "time-fallback" };

function daysSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
}

export function reviewInviteEligibility(cart: CartEligibilityInput, now: Date): EligibilityResult {
  const pos = cart.purchaseOrders;

  if (pos.length > 0) {
    const allDelivered = pos.every((po) => po.status === "DELIVERED" && po.deliveredAt != null);
    if (allDelivered) {
      const latest = pos.reduce<Date>(
        (max, po) => (po.deliveredAt! > max ? po.deliveredAt! : max),
        pos[0].deliveredAt!,
      );
      if (daysSince(latest, now) >= DAYS_AFTER_DELIVERY) {
        return { eligible: true, signal: "delivered", deliveredAt: latest };
      }
      return { eligible: false };
    }
    // Con PO pero no todos entregados: válvula de seguridad por si algo
    // quedó sin marcar (no bloquear la campaña indefinidamente por un olvido).
    if (daysSince(cart.orderedAt, now) >= FALLBACK_DAYS_STUCK) {
      return { eligible: true, signal: "time-fallback" };
    }
    return { eligible: false };
  }

  // Sin PurchaseOrder en absoluto: sin señal de entrega, plazo por defecto.
  if (daysSince(cart.orderedAt, now) >= FALLBACK_DAYS_NO_SIGNAL) {
    return { eligible: true, signal: "time-fallback" };
  }
  return { eligible: false };
}
