/**
 * Vista PÚBLICA de una cotización: lo que devuelve `GET /api/v1/quotes/{id}`
 * a un integrador con API key.
 *
 * Vive en `lib/` y no dentro del `route.ts` por la razón de siempre en este
 * repo: lo que se queda en una ruta de Next no se puede testear, y aquí lo que
 * hay que probar no es un cálculo sino una **ausencia** — que ningún nombre de
 * proveedor salga hacia el cliente.
 *
 * El fallo que la motiva (13-ago-2026): la respuesta emitía
 * `fulfillment.midoceanOrderId` / `midoceanOrderStatus`. El *valor* era
 * inofensivo, pero el **nombre del campo** delataba al proveedor a quien lee
 * la API. La columna de BD conserva su nombre histórico; lo que cambia es el
 * contrato público. Se pudo hacer sin romper a nadie porque en ese momento
 * había 0 claves de API emitidas y 0 cotizaciones con pedido de proveedor —
 * medido antes de tocar nada. Más adelante habría sido un breaking change.
 */

export type PublicQuoteSource = {
  id: string;
  createdAt: Date;
  status: string;
  acceptedTotalCents: number | null;
  depositPercent: number | null;
  paymentLinkToken: string | null;
  midoceanOrderId: string | null;
  midoceanOrderStatus: string | null;
  orderedAt: Date | null;
  confirmedAt: Date | null;
  items: {
    productRef: string | null;
    productName: string | null;
    quantity: number;
    markingTechniqueName: string | null;
    markingPositionId: string | null;
    markingColours: number | null;
    unitPriceClientCents: number | null;
    totalClientCents: number | null;
  }[];
  payments: { amountCents: number }[];
};

export function toPublicQuoteView(cart: PublicQuoteSource, siteUrl: string) {
  return {
    id: cart.id,
    createdAt: cart.createdAt,
    status: cart.status,
    pricing: {
      acceptedTotalCents: cart.acceptedTotalCents,
      depositPercent: cart.depositPercent,
      paid: cart.payments.reduce((s, p) => s + p.amountCents, 0),
      paymentUrl: cart.paymentLinkToken ? `${siteUrl}/pay/${cart.paymentLinkToken}` : null,
    },
    fulfillment: {
      // Nombres NEUTROS: es el cliente quien lee esto, no el equipo.
      supplierOrderId: cart.midoceanOrderId,
      supplierOrderStatus: cart.midoceanOrderStatus,
      confirmedAt: cart.confirmedAt,
      orderedAt: cart.orderedAt,
    },
    items: cart.items.map((it) => ({
      ref: it.productRef,
      name: it.productName,
      quantity: it.quantity,
      marking: it.markingTechniqueName
        ? {
            technique: it.markingTechniqueName,
            position: it.markingPositionId,
            colours: it.markingColours,
          }
        : null,
      unitPriceCents: it.unitPriceClientCents,
      totalCents: it.totalClientCents,
    })),
  };
}
