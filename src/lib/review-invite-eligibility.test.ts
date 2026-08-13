import { describe, it, expect } from "vitest";
import { reviewInviteEligibility } from "./review-invite-eligibility";

const NOW = new Date("2026-08-13T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("reviewInviteEligibility", () => {
  it("entrega confirmada hace ≥5 días → elegible, señal 'delivered'", () => {
    const r = reviewInviteEligibility(
      { orderedAt: daysAgo(30), purchaseOrders: [{ status: "DELIVERED", deliveredAt: daysAgo(5) }] },
      NOW,
    );
    expect(r).toEqual({ eligible: true, signal: "delivered", deliveredAt: daysAgo(5) });
  });

  it("entrega confirmada hace 2 días → NO elegible todavía (margen de uso)", () => {
    const r = reviewInviteEligibility(
      { orderedAt: daysAgo(10), purchaseOrders: [{ status: "DELIVERED", deliveredAt: daysAgo(2) }] },
      NOW,
    );
    expect(r.eligible).toBe(false);
  });

  it("varios PO, el último entregado marca la fecha (espera a TODOS)", () => {
    const r = reviewInviteEligibility(
      {
        orderedAt: daysAgo(30),
        purchaseOrders: [
          { status: "DELIVERED", deliveredAt: daysAgo(20) },
          { status: "DELIVERED", deliveredAt: daysAgo(6) },
        ],
      },
      NOW,
    );
    expect(r).toEqual({ eligible: true, signal: "delivered", deliveredAt: daysAgo(6) });
  });

  it("un PO sin entregar entre varios → NO elegible (sigue en curso), aunque otro ya llegara", () => {
    const r = reviewInviteEligibility(
      {
        orderedAt: daysAgo(30),
        purchaseOrders: [
          { status: "DELIVERED", deliveredAt: daysAgo(10) },
          { status: "SHIPPED", deliveredAt: null },
        ],
      },
      NOW,
    );
    expect(r.eligible).toBe(false);
  });

  it("con PO pendiente pero pedido MUY antiguo (45+ días) → fallback, no bloquea para siempre", () => {
    const r = reviewInviteEligibility(
      { orderedAt: daysAgo(46), purchaseOrders: [{ status: "SHIPPED", deliveredAt: null }] },
      NOW,
    );
    expect(r).toEqual({ eligible: true, signal: "time-fallback" });
  });

  it("con PO pendiente y pedido de 40 días (bajo el umbral de la válvula) → NO elegible aún", () => {
    const r = reviewInviteEligibility(
      { orderedAt: daysAgo(40), purchaseOrders: [{ status: "SHIPPED", deliveredAt: null }] },
      NOW,
    );
    expect(r.eligible).toBe(false);
  });

  it("sin ningún PurchaseOrder (flujo antiguo) y pedido de 21+ días → fallback por tiempo", () => {
    const r = reviewInviteEligibility({ orderedAt: daysAgo(21), purchaseOrders: [] }, NOW);
    expect(r).toEqual({ eligible: true, signal: "time-fallback" });
  });

  it("sin ningún PurchaseOrder y pedido reciente (7 días, el umbral ANTIGUO) → ya NO es elegible", () => {
    // Regresión del bug: el umbral viejo (7 días desde el pago) era
    // demasiado agresivo para merchandising personalizado.
    const r = reviewInviteEligibility({ orderedAt: daysAgo(7), purchaseOrders: [] }, NOW);
    expect(r.eligible).toBe(false);
  });

  it("PO con status DELIVERED pero deliveredAt null (dato inconsistente) → tratado como no entregado, no revienta", () => {
    const r = reviewInviteEligibility(
      { orderedAt: daysAgo(50), purchaseOrders: [{ status: "DELIVERED", deliveredAt: null }] },
      NOW,
    );
    // Cae a la válvula de seguridad por tiempo, no lanza ni confía en un dato roto.
    expect(r).toEqual({ eligible: true, signal: "time-fallback" });
  });
});
