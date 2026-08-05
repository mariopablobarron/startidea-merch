import { describe, it, expect, vi, beforeEach } from "vitest";

const cartFindUnique = vi.fn();
const cartUpdate = vi.fn();
const poUpdate = vi.fn();
const createOrderMock = vi.fn();
const notifyTelegramMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: {
      findUnique: (...a: unknown[]) => cartFindUnique(...a),
      update: (...a: unknown[]) => cartUpdate(...a),
    },
    purchaseOrder: {
      update: (...a: unknown[]) => poUpdate(...a),
    },
  },
}));

vi.mock("@/lib/suppliers/midocean-orders", () => ({
  midoceanOrders: {
    createOrder: (...a: unknown[]) => createOrderMock(...a),
  },
}));

vi.mock("@/lib/telegram", () => ({
  notifyTelegram: (...a: unknown[]) => notifyTelegramMock(...a),
}));

import { autoPlaceMidoceanOrder } from "./midocean-auto-order";

/**
 * Tests de src/lib/midocean-auto-order.ts — el camino del dinero que SALE.
 *
 * Esta función se dispara sola desde el webhook de Stripe cuando un cliente
 * paga, y su efecto no es una fila en una tabla: es **un pedido real a un
 * proveedor**, con mercancía que se fabrica y una factura que se paga. En
 * producción está armado (`MIDOCEAN_LIVE_ORDERS=true`,
 * `MIDOCEAN_AUTO_PLACE_ON_PAYMENT=true`), y hasta hoy estaba a CERO tests.
 *
 * Lo que se fija aquí son invariantes económicos, no de forma. En orden de
 * cuánto cuesta romperlos:
 *
 *   1. NO se llama al proveedor cuando no se debe — apagado por env, cart ya
 *      pedido, sin dirección de envío. Cada uno de esos tres es un pedido real
 *      que no debería existir.
 *   2. Solo se piden los items de ESTE proveedor. Colar en el pedido de
 *      MidOcean un artículo de Makito es pedir (y pagar) mercancía equivocada.
 *   3. Cantidades y SKUs viajan tal cual desde el carrito: pedir 10 donde el
 *      cliente pagó 100 (o al revés) es dinero en las dos direcciones.
 *   4. Un pedido rechazado NUNCA se da por bueno: el cart no puede quedar
 *      ORDERED si el proveedor dijo que no, o el cliente se queda sin nada
 *      mientras el panel dice que está pedido.
 *
 * Se mockea Prisma, el cliente HTTP de MidOcean y Telegram: lo que se prueba
 * es la decisión de pedir o no pedir y qué se pide, que es donde está el
 * dinero, no el transporte.
 */

type CartOverrides = Record<string, unknown>;

/** Cart pagado, con dirección completa y un único item — el camino feliz. */
function cart(overrides: CartOverrides = {}) {
  return {
    id: "cart_abcdef123456",
    name: "Cliente SL",
    company: "Cliente SL",
    email: "cliente@ejemplo.es",
    phone: "600000000",
    vatNumber: "B12345678",
    message: null,
    shippingAddress: "Calle Falsa 123",
    shippingPostalCode: "18001",
    shippingCity: "Granada",
    shippingCountry: "ES",
    midoceanOrderId: null,
    items: [
      {
        id: "it_1",
        productRef: "MO1234",
        variantSku: "MO1234-05",
        quantity: 100,
        purchaseOrderId: null,
        customerLogoUrl: null,
        markingTechniqueCode: null,
        markingPositionId: null,
        markingColours: null,
        markings: [],
      },
    ],
    purchaseOrders: [],
    ...overrides,
  };
}

/** Extrae el payload con el que se llamó al proveedor. */
function payloadEnviado() {
  return createOrderMock.mock.calls[0][0] as {
    items: Array<{ master_code: string; sku: string; quantity: number }>;
    shipping_address: Record<string, unknown>;
    customer_order_reference: string;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MIDOCEAN_AUTO_PLACE_ON_PAYMENT;
  cartUpdate.mockResolvedValue({});
  poUpdate.mockResolvedValue({});
  notifyTelegramMock.mockResolvedValue(undefined);
  createOrderMock.mockResolvedValue({ dryRun: false, ok: true, orderId: "MO-ORDER-1", raw: {} });
});

describe("autoPlaceMidoceanOrder · cuándo NO se llama al proveedor", () => {
  it("con MIDOCEAN_AUTO_PLACE_ON_PAYMENT=false no pide nada y ni siquiera lee el cart", async () => {
    process.env.MIDOCEAN_AUTO_PLACE_ON_PAYMENT = "false";

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ skipped: true });
    expect(createOrderMock).not.toHaveBeenCalled();
    // El apagado debe cortar ANTES de tocar la BD: si no, "apagado" solo
    // significaría "hace todo el trabajo menos el último paso".
    expect(cartFindUnique).not.toHaveBeenCalled();
  });

  it("si el cart ya tiene midoceanOrderId no vuelve a pedir", async () => {
    cartFindUnique.mockResolvedValue(cart({ midoceanOrderId: "MO-ORDER-YA" }));

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ skipped: true });
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("sin dirección de envío NO pide y avisa al admin para que lo revise a mano", async () => {
    cartFindUnique.mockResolvedValue(cart({ shippingAddress: null }));

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ skipped: true });
    expect(createOrderMock).not.toHaveBeenCalled();
    // Sin el aviso, un pago con dirección incompleta se quedaría en silencio.
    expect(notifyTelegramMock).toHaveBeenCalled();
  });

  it("cart vacío no genera pedido", async () => {
    cartFindUnique.mockResolvedValue(cart({ items: [] }));

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ skipped: true });
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("cart inexistente devuelve error controlado, no excepción", async () => {
    cartFindUnique.mockResolvedValue(null);

    const res = await autoPlaceMidoceanOrder("cart_inexistente");

    expect(res).toMatchObject({ ok: false });
    expect(createOrderMock).not.toHaveBeenCalled();
  });
});

describe("autoPlaceMidoceanOrder · qué se pide exactamente", () => {
  it("con varios proveedores en el carrito, solo pide los items del PO de MidOcean", async () => {
    // Carrito mixto: un artículo de MidOcean y otro que quedó asignado al PO
    // de otro proveedor. Pedir el segundo a MidOcean sería comprar mercancía
    // equivocada y pagarla.
    cartFindUnique.mockResolvedValue(
      cart({
        purchaseOrders: [
          { id: "po_mid", supplier: "midocean" },
          { id: "po_mak", supplier: "makito" },
        ],
        items: [
          { ...cart().items[0], id: "it_mid", productRef: "MO1234", purchaseOrderId: "po_mid" },
          { ...cart().items[0], id: "it_mak", productRef: "MK9999", purchaseOrderId: "po_mak" },
        ],
      }),
    );

    await autoPlaceMidoceanOrder("cart_abcdef123456");

    const refs = payloadEnviado().items.map((i) => i.master_code);
    expect(refs).toEqual(["MO1234"]);
    expect(refs).not.toContain("MK9999");
  });

  it("si el carrito no tiene ni un item de MidOcean, no se pide nada", async () => {
    cartFindUnique.mockResolvedValue(
      cart({
        purchaseOrders: [{ id: "po_mid", supplier: "midocean" }],
        items: [{ ...cart().items[0], purchaseOrderId: "po_otro" }],
      }),
    );

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ skipped: true });
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("cantidad y SKU viajan tal cual desde el carrito", async () => {
    cartFindUnique.mockResolvedValue(
      cart({ items: [{ ...cart().items[0], quantity: 250, variantSku: "MO1234-07" }] }),
    );

    await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(payloadEnviado().items[0]).toMatchObject({
      master_code: "MO1234",
      sku: "MO1234-07",
      quantity: 250,
    });
  });

  it("sin variantSku cae al productRef en vez de mandar un SKU vacío", async () => {
    cartFindUnique.mockResolvedValue(
      cart({ items: [{ ...cart().items[0], variantSku: null }] }),
    );

    await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(payloadEnviado().items[0].sku).toBe("MO1234");
  });

  it("la dirección de envío del pedido es la del cliente, no un valor por defecto", async () => {
    cartFindUnique.mockResolvedValue(cart());

    await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(payloadEnviado().shipping_address).toMatchObject({
      street1: "Calle Falsa 123",
      postal_code: "18001",
      city: "Granada",
      country: "ES",
      email: "cliente@ejemplo.es",
    });
  });
});

describe("autoPlaceMidoceanOrder · qué se da por pedido y qué no", () => {
  it("en el camino feliz marca el cart ORDERED con el id del proveedor", async () => {
    cartFindUnique.mockResolvedValue(cart());

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ ok: true, orderId: "MO-ORDER-1" });
    const data = cartUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ midoceanOrderId: "MO-ORDER-1", status: "ORDERED" });
  });

  it("si el proveedor RECHAZA el pedido, el cart NO queda ORDERED", async () => {
    // El fallo más caro posible: dar por pedido lo que el proveedor rechazó.
    // El cliente ha pagado, el panel diría "pedido" y no llegaría nada.
    createOrderMock.mockResolvedValue({ dryRun: false, ok: false, status: 400, error: "rechazado" });
    cartFindUnique.mockResolvedValue(
      cart({
        purchaseOrders: [{ id: "po_mid", supplier: "midocean" }],
        items: [{ ...cart().items[0], purchaseOrderId: "po_mid" }],
      }),
    );

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ ok: false });
    const marcadoOrdered = cartUpdate.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === "ORDERED",
    );
    expect(marcadoOrdered).toBe(false);
    // Y el PO queda FAILED para que se vea en el panel.
    expect(poUpdate.mock.calls[0][0].data).toMatchObject({ status: "FAILED" });
  });

  it("en dry-run guarda el payload pero NO da el cart por pedido", async () => {
    // dry-run existe para probar el flujo sin comprar. Si marcase ORDERED,
    // una prueba dejaría pedidos fantasma en el panel.
    createOrderMock.mockResolvedValue({ dryRun: true, payload: {}, reason: "sin API key" });
    cartFindUnique.mockResolvedValue(cart());

    const res = await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(res).toMatchObject({ ok: true, dryRun: true });
    const data = cartUpdate.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.midoceanOrderId).toBeUndefined();
  });

  it("con split, el PO de MidOcean queda PLACED con la referencia del proveedor", async () => {
    cartFindUnique.mockResolvedValue(
      cart({
        purchaseOrders: [{ id: "po_mid", supplier: "midocean" }],
        items: [{ ...cart().items[0], purchaseOrderId: "po_mid" }],
      }),
    );

    await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(poUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "po_mid" },
      data: { status: "PLACED", supplierOrderRef: "MO-ORDER-1" },
    });
  });
});

describe("autoPlaceMidoceanOrder · carrito que no es de MidOcean", () => {
  it("un carrito SOLO de Makito no debe generar pedido a MidOcean", async () => {
    cartFindUnique.mockResolvedValue(
      cart({
        purchaseOrders: [{ id: "po_mak", supplier: "makito" }],
        items: [
          { ...cart().items[0], productRef: "MK9999", variantSku: "MK9999-01", purchaseOrderId: "po_mak" },
        ],
      }),
    );

    await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(createOrderMock).not.toHaveBeenCalled();
  });
});

describe("autoPlaceMidoceanOrder · el fallback legacy sigue funcionando", () => {
  it("sin NINGÚN PurchaseOrder (cart anterior al split) sí pide sus items", async () => {
    // El fallback existe para carts antiguos, previos al split por proveedor.
    // El corte de arriba no puede llevárselo por delante: eso dejaría pedidos
    // legacy sin cursar.
    cartFindUnique.mockResolvedValue(cart({ purchaseOrders: [] }));

    await autoPlaceMidoceanOrder("cart_abcdef123456");

    expect(createOrderMock).toHaveBeenCalledTimes(1);
    expect(payloadEnviado().items[0].master_code).toBe("MO1234");
  });
});
