import { beforeEach, describe, expect, it, vi } from "vitest";

const cartFindUnique = vi.fn();
const poUpdate = vi.fn();
const productFindMany = vi.fn();
const notifyTelegram = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: { findUnique: (...args: unknown[]) => cartFindUnique(...args) },
    purchaseOrder: { update: (...args: unknown[]) => poUpdate(...args) },
    product: { findMany: (...args: unknown[]) => productFindMany(...args) },
  },
}));

vi.mock("@/lib/telegram", () => ({
  notifyTelegram: (...args: unknown[]) => notifyTelegram(...args),
}));

import { autoPlaceMakitoOrder } from "./makito-auto-order";

function cart(variantSku: string | null = "MK-RED") {
  return {
    id: "cart_makito",
    name: "Cliente SL",
    company: null,
    email: "cliente@example.com",
    phone: "600000000",
    shippingAddress: "Calle Uno",
    shippingPostalCode: "18001",
    shippingCity: "Granada",
    shippingCountry: "ES",
    items: [
      {
        id: "item_1",
        productSlug: "producto-makito",
        productRef: "STM-PUBLICA",
        productName: "Producto Makito",
        variantSku,
        quantity: 25,
        purchaseOrderId: "po_makito",
        markingTechniqueName: null,
      },
    ],
    purchaseOrders: [
      {
        id: "po_makito",
        supplier: "makito",
        totalClientCents: 10_000,
        internalNotes: null,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MAKITO_AUTO_PLACE_ON_PAYMENT;
  poUpdate.mockResolvedValue({});
  notifyTelegram.mockResolvedValue(undefined);
  productFindMany.mockResolvedValue([
    {
      slug: "producto-makito",
      supplier: "makito",
      supplierRef: "MK-ROOT",
      _count: { variants: 1 },
      variants: [{ sku: "MK-RED" }],
    },
  ]);
});

describe("autoPlaceMakitoOrder · variante de proveedor", () => {
  it("notifica el SKU exacto y nunca la referencia pública", async () => {
    cartFindUnique.mockResolvedValue(cart());

    const result = await autoPlaceMakitoOrder("cart_makito");

    expect(result).toMatchObject({ ok: true, notified: true });
    expect(notifyTelegram).toHaveBeenCalledWith(expect.stringContaining("MK-RED"));
    expect(notifyTelegram).not.toHaveBeenCalledWith(expect.stringContaining("STM-PUBLICA"));
    expect(poUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { internalNotes: expect.stringContaining("MK-RED") },
      }),
    );
  });

  it("resuelve automáticamente el único SKU si el carrito histórico no lo trae", async () => {
    cartFindUnique.mockResolvedValue(cart(null));

    const result = await autoPlaceMakitoOrder("cart_makito");

    expect(result).toMatchObject({ ok: true, notified: true });
    expect(notifyTelegram).toHaveBeenCalledWith(expect.stringContaining("MK-RED"));
  });

  it("con varias variantes y SKU nulo no notifica ni marca el PO", async () => {
    cartFindUnique.mockResolvedValue(cart(null));
    productFindMany.mockResolvedValue([
      {
        slug: "producto-makito",
        supplier: "makito",
        supplierRef: "MK-ROOT",
        _count: { variants: 2 },
        variants: [{ sku: "MK-RED" }],
      },
    ]);

    const result = await autoPlaceMakitoOrder("cart_makito");

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("variante exacta") });
    expect(notifyTelegram).not.toHaveBeenCalled();
    expect(poUpdate).not.toHaveBeenCalled();
  });
});
