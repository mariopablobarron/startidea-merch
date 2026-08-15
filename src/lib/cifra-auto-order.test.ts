import { describe, it, expect, vi, beforeEach } from "vitest";

const cartFindUnique = vi.fn();
const poUpdate = vi.fn();
const createOrderMock = vi.fn();
const notifyTelegramMock = vi.fn();
const productFindMany = vi.fn();

/** Ver el porqué de la unicidad síncrona en midocean-auto-order.test.ts. */
const settings = new Map<string, number>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: { findUnique: (...a: unknown[]) => cartFindUnique(...a) },
    purchaseOrder: { update: (...a: unknown[]) => poUpdate(...a) },
    product: { findMany: (...a: unknown[]) => productFindMany(...a) },
    adminSetting: {
      create: ({ data }: { data: { key: string; value: number } }) => {
        if (settings.has(data.key)) return Promise.reject(new Error("unique constraint"));
        settings.set(data.key, data.value);
        return Promise.resolve(data);
      },
      findUnique: ({ where }: { where: { key: string } }) =>
        Promise.resolve(settings.has(where.key) ? { value: settings.get(where.key) } : null),
      updateMany: ({
        where,
        data,
      }: {
        where: { key: string; value: { equals: number } };
        data: { value: number };
      }) => {
        if (settings.get(where.key) !== where.value.equals) return Promise.resolve({ count: 0 });
        settings.set(where.key, data.value);
        return Promise.resolve({ count: 1 });
      },
      delete: ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
        return Promise.resolve({});
      },
    },
  },
}));

vi.mock("@/lib/suppliers/cifra", () => ({
  createOrder: (...a: unknown[]) => createOrderMock(...a),
}));

vi.mock("@/lib/telegram", () => ({
  notifyTelegram: (...a: unknown[]) => notifyTelegramMock(...a),
}));

import { autoPlaceCifraOrder } from "./cifra-auto-order";

/**
 * Tests de src/lib/cifra-auto-order.ts.
 *
 * Hoy Cifra va en simulación (`CIFRA_LIVE_ORDERS` no está activada en
 * producción), así que ninguno de estos casos muerde todavía. Existen
 * precisamente por eso: el día que se active bastará ese cambio de una variable
 * de entorno para que este camino empiece a comprar de verdad, y conviene que
 * la red esté puesta ANTES y no después del primer pedido real.
 */
function cart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart_cifra01",
    name: "Cliente SL",
    email: "cliente@ejemplo.es",
    phone: "600000000",
    message: null,
    shippingAddress: "Calle Falsa 123",
    shippingPostalCode: "18001",
    shippingCity: "Granada",
    shippingCountry: "ES",
    items: [
      { id: "it_1", productSlug: "a-012", productRef: "STM-CIFRA", variantSku: "A-012-AM", quantity: 50, purchaseOrderId: "po_cif" },
    ],
    purchaseOrders: [
      { id: "po_cif", supplier: "cifra", status: "PENDING", supplierOrderRef: null, internalNotes: null },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.clear();
  delete process.env.CIFRA_AUTO_PLACE_ON_PAYMENT;
  process.env.CIFRA_LIVE_ORDERS = "true"; // simulamos el día que Mario lo active
  poUpdate.mockResolvedValue({});
  notifyTelegramMock.mockResolvedValue(undefined);
  createOrderMock.mockResolvedValue({ data: { order_id: "CIF-1", total: 500 } });
  productFindMany.mockImplementation(
    async ({ where }: { where: { slug: { in: string[] } } }) =>
      where.slug.in.map((slug) => ({
        slug,
        supplier: "cifra",
        supplierRef: "A-012",
        _count: { variants: 1 },
        variants: [{ sku: "A-012-AM" }],
      })),
  );
});

describe("autoPlaceCifraOrder · con los pedidos en vivo", () => {
  it("dos ejecuciones solapadas hacen UN solo pedido", async () => {
    cartFindUnique.mockResolvedValue(cart());
    createOrderMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { data: { order_id: "CIF-1", total: 500 } };
    });

    await Promise.all([autoPlaceCifraOrder("cart_cifra01"), autoPlaceCifraOrder("cart_cifra01")]);

    expect(createOrderMock).toHaveBeenCalledTimes(1);
  });

  it("no pide si el carrito no lleva productos de Cifra", async () => {
    cartFindUnique.mockResolvedValue(cart({ purchaseOrders: [] }));

    const res = await autoPlaceCifraOrder("cart_cifra01");

    expect(res).toMatchObject({ skipped: true });
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("sin variantSku y con varias variantes corta antes de Cifra", async () => {
    cartFindUnique.mockResolvedValue(
      cart({ items: [{ ...cart().items[0], variantSku: null }] }),
    );
    productFindMany.mockResolvedValue([
      {
        slug: "a-012",
        supplier: "cifra",
        supplierRef: "A-012",
        _count: { variants: 2 },
        variants: [{ sku: "A-012-AM" }],
      },
    ]);

    const result = await autoPlaceCifraOrder("cart_cifra01");

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("variante exacta") });
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it("sin dirección de envío no pide y avisa", async () => {
    cartFindUnique.mockResolvedValue(cart({ shippingAddress: null }));

    await autoPlaceCifraOrder("cart_cifra01");

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(notifyTelegramMock).toHaveBeenCalled();
    // No se ha hablado con nadie ⇒ el carrito queda libre para reintentar.
    expect([...settings.keys()].some((k) => k.includes("cart_cifra01"))).toBe(false);
  });

  it("un rechazo de Cifra deja el PO en FAILED, no en PLACED", async () => {
    createOrderMock.mockRejectedValue(new Error("modelo inexistente"));
    cartFindUnique.mockResolvedValue(cart());

    const res = await autoPlaceCifraOrder("cart_cifra01");

    expect(res).toMatchObject({ ok: false });
    expect(poUpdate.mock.calls[0][0].data).toMatchObject({ status: "FAILED" });
  });
});

describe("autoPlaceCifraOrder · en simulación (como está hoy en producción)", () => {
  it("no llama a Cifra y suelta el cerrojo", async () => {
    process.env.CIFRA_LIVE_ORDERS = "false";
    cartFindUnique.mockResolvedValue(cart());

    const res = await autoPlaceCifraOrder("cart_cifra01");

    expect(res).toMatchObject({ dryRun: true });
    expect(createOrderMock).not.toHaveBeenCalled();
    expect([...settings.keys()].some((k) => k.includes("cart_cifra01"))).toBe(false);
  });
});

describe("autoPlaceCifraOrder · el cerrojo no se suelta si ya se pidió", () => {
  it("tras un pedido cursado con éxito sigue puesto", async () => {
    // Soltarlo reabriría la ventana entre la llamada y el momento en que el PO
    // queda PLACED con su referencia.
    cartFindUnique.mockResolvedValue(cart());

    await autoPlaceCifraOrder("cart_cifra01");

    expect([...settings.keys()].some((k) => k.includes("cart_cifra01"))).toBe(true);
  });

  it("tras un rechazo de Cifra tampoco se suelta", async () => {
    // Se llegó a hablar con ellos: el reintento lo decide una persona desde el
    // panel, no un segundo disparo automático.
    createOrderMock.mockRejectedValue(new Error("modelo inexistente"));
    cartFindUnique.mockResolvedValue(cart());

    await autoPlaceCifraOrder("cart_cifra01");

    expect([...settings.keys()].some((k) => k.includes("cart_cifra01"))).toBe(true);
  });
});
