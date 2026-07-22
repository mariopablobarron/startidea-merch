import { describe, it, expect } from "vitest";
import { cartTotalCents, type CartItem } from "./cart-storage";

/**
 * `cartTotalCents` es el total (céntimos, sin IVA) que ve el cliente en el
 * widget de la cesta. Debe sumar `totalClientCents` de cada línea tratando el
 * nulo como 0 — una línea sin precio calculado NO debe envenenar el total con
 * NaN ni descartar el resto de líneas.
 */

function line(totalClientCents: number | null | undefined): CartItem {
  return {
    productSlug: "s",
    productRef: "STM-1",
    productName: "P",
    quantity: 1,
    totalClientCents: totalClientCents ?? null,
  } as CartItem;
}

describe("cartTotalCents", () => {
  it("carrito vacío → 0", () => {
    expect(cartTotalCents([])).toBe(0);
  });

  it("suma los totales de línea", () => {
    expect(cartTotalCents([line(1200), line(800), line(50)])).toBe(2050);
  });

  it("una línea sin total (null) cuenta como 0, no rompe el resto", () => {
    expect(cartTotalCents([line(1200), line(null), line(800)])).toBe(2000);
  });

  it("todas las líneas sin total → 0 (no NaN)", () => {
    const total = cartTotalCents([line(null), line(undefined)]);
    expect(total).toBe(0);
    expect(Number.isNaN(total)).toBe(false);
  });

  it("total = 0 explícito se respeta", () => {
    expect(cartTotalCents([line(0), line(0)])).toBe(0);
  });
});
