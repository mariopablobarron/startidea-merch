import { describe, it, expect } from "vitest";
import { toPublicQuoteView, type PublicQuoteSource } from "./public-quote-view";
import { findSupplierLeak } from "./supplier-leak-terms";

function cart(p: Partial<PublicQuoteSource> = {}): PublicQuoteSource {
  return {
    id: "cq_1",
    createdAt: new Date("2026-08-13T10:00:00Z"),
    status: "ACCEPTED",
    acceptedTotalCents: 124550,
    depositPercent: 50,
    paymentLinkToken: "pay_abc",
    midoceanOrderId: "MO-99887",
    midoceanOrderStatus: "SHIPPED",
    orderedAt: new Date("2026-08-12T09:00:00Z"),
    confirmedAt: null,
    items: [
      {
        productRef: "STM-QPUCB3",
        productName: "Sudadera orgánica",
        quantity: 100,
        markingTechniqueName: "Serigrafía",
        markingPositionId: "pecho",
        markingColours: 1,
        unitPriceClientCents: 1245,
        totalClientCents: 124500,
      },
    ],
    payments: [{ amountCents: 60000 }],
    ...p,
  };
}

/** Todas las CLAVES del objeto, a cualquier profundidad. */
function claves(v: unknown, acc: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => claves(x, acc));
  else if (v && typeof v === "object" && !(v instanceof Date)) {
    for (const [k, val] of Object.entries(v)) {
      acc.push(k);
      claves(val, acc);
    }
  }
  return acc;
}

describe("toPublicQuoteView", () => {
  it("REGRESIÓN: ninguna CLAVE del contrato público nombra al proveedor", () => {
    // El fallo del 13-ago no estaba en un valor sino en el NOMBRE del campo:
    // `fulfillment.midoceanOrderId` se lo servía a quien tuviera API key.
    // Recorrer las claves —en vez de comprobar dos nombres concretos— hace que
    // esto siga cazando cualquier campo que se añada en el futuro.
    for (const k of claves(toPublicQuoteView(cart(), "https://x.es"))) {
      expect(findSupplierLeak(k), `la clave "${k}" nombra al proveedor`).toBeNull();
    }
  });

  it("ningún VALOR de texto delata al proveedor", () => {
    const texto = JSON.stringify(toPublicQuoteView(cart(), "https://x.es"));
    // Nota: el ID de pedido del proveedor (MO-99887) sí viaja, y es correcto —
    // el cliente necesita un identificador de seguimiento y ese código no
    // nombra a nadie. Lo que no puede aparecer es el nombre.
    expect(findSupplierLeak(texto)).toBeNull();
  });

  it("sigue entregando el dato de seguimiento, solo que con nombre neutro", () => {
    const v = toPublicQuoteView(cart(), "https://x.es");
    expect(v.fulfillment.supplierOrderId).toBe("MO-99887");
    expect(v.fulfillment.supplierOrderStatus).toBe("SHIPPED");
  });

  it("la matemática del contrato no cambia", () => {
    const v = toPublicQuoteView(cart(), "https://x.es");
    expect(v.pricing.paid).toBe(60000);
    expect(v.pricing.acceptedTotalCents).toBe(124550);
    expect(v.pricing.paymentUrl).toBe("https://x.es/pay/pay_abc");
    expect(v.items[0].ref).toBe("STM-QPUCB3");
    expect(v.items[0].totalCents).toBe(124500);
  });

  it("sin token de pago no inventa una URL", () => {
    expect(toPublicQuoteView(cart({ paymentLinkToken: null }), "https://x.es").pricing.paymentUrl).toBeNull();
  });

  it("sin marcaje, la línea no trae bloque de marcaje", () => {
    const c = cart();
    c.items[0].markingTechniqueName = null;
    expect(toPublicQuoteView(c, "https://x.es").items[0].marking).toBeNull();
  });
});
