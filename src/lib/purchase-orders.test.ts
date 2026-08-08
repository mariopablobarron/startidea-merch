import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests de src/lib/purchase-orders.ts — el reparto de un carrito pagado en
 * órdenes de compra, una por proveedor.
 *
 * Es el paso previo a pedir: de estos PurchaseOrder salen los items que cada
 * `*-auto-order` manda a su proveedor, y su `totalClientCents` es lo que se ve
 * en el panel. Estaba a cero tests.
 *
 * Aquí no basta con mocks que devuelvan valores fijos: lo que hay que poder
 * demostrar es qué pasa cuando la función se ejecuta DOS VECES A LA VEZ, y
 * para eso hace falta que los mocks se comporten como una base de datos con
 * estado. De ahí la mini-BD en memoria de abajo.
 */

type PO = { id: string; cartId: string; supplier: string; totalClientCents: number };
type Item = { id: string; cartId: string; productSlug: string; totalClientCents: number; purchaseOrderId: string | null };

const db = {
  items: [] as Item[],
  pos: [] as PO[],
  productos: [] as Array<{ slug: string; supplier: string }>,
  settings: new Map<string, number>(),
  seq: 0,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuoteItem: {
      findMany: async ({ where }: { where: { cartId: string } }) =>
        db.items.filter((i) => i.cartId === where.cartId).map((i) => ({ ...i })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: { purchaseOrderId: string };
      }) => {
        for (const it of db.items) {
          if (where.id.in.includes(it.id)) it.purchaseOrderId = data.purchaseOrderId;
        }
        return { count: where.id.in.length };
      },
    },
    product: {
      findMany: async ({ where }: { where: { slug: { in: string[] } } }) =>
        db.productos.filter((p) => where.slug.in.includes(p.slug)).map((p) => ({ ...p })),
    },
    purchaseOrder: {
      findFirst: async ({ where }: { where: { cartId: string; supplier: string } }) =>
        db.pos.find((p) => p.cartId === where.cartId && p.supplier === where.supplier) ?? null,
      findMany: async ({ where }: { where: { cartId: string } }) =>
        db.pos.filter((p) => p.cartId === where.cartId).map((p) => ({ ...p })),
      create: async ({ data }: { data: Record<string, unknown> & { items?: { connect: Array<{ id: string }> } } }) => {
        const po: PO = {
          id: `po_${++db.seq}`,
          cartId: data.cartId as string,
          supplier: data.supplier as string,
          totalClientCents: data.totalClientCents as number,
        };
        db.pos.push(po);
        for (const c of data.items?.connect ?? []) {
          const it = db.items.find((i) => i.id === c.id);
          if (it) it.purchaseOrderId = po.id;
        }
        return { ...po };
      },
      update: async ({ where, data }: { where: { id: string }; data: { totalClientCents?: number } }) => {
        const po = db.pos.find((p) => p.id === where.id);
        if (po && typeof data.totalClientCents === "number") po.totalClientCents = data.totalClientCents;
        return po ? { ...po } : null;
      },
    },
    // El $transaction del código recibe un array de promesas YA lanzadas, así
    // que aquí basta con esperarlas: el mock no simula atomicidad, y eso es
    // justo lo que permite que se vea la carrera.
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    // El cerrojo se usa REAL contra esto. Comprobación e inserción SÍNCRONAS
    // antes de devolver la promesa: es lo que modela el índice único de
    // Postgres. Tras un `await`, las dos ejecuciones ganarían y el test
    // mentiría diciendo que la carrera está cerrada cuando no lo está.
    adminSetting: {
      create: ({ data }: { data: { key: string; value: number } }) => {
        if (db.settings.has(data.key)) return Promise.reject(new Error("unique constraint"));
        db.settings.set(data.key, data.value);
        return Promise.resolve(data);
      },
      findUnique: ({ where }: { where: { key: string } }) =>
        Promise.resolve(db.settings.has(where.key) ? { value: db.settings.get(where.key) } : null),
      updateMany: ({
        where,
        data,
      }: {
        where: { key: string; value: { equals: number } };
        data: { value: number };
      }) => {
        if (db.settings.get(where.key) !== where.value.equals) return Promise.resolve({ count: 0 });
        db.settings.set(where.key, data.value);
        return Promise.resolve({ count: 1 });
      },
      delete: ({ where }: { where: { key: string } }) => {
        db.settings.delete(where.key);
        return Promise.resolve({});
      },
    },
  },
}));

import { createPurchaseOrdersFromCart } from "./purchase-orders";

function sembrarCarrito(cartId: string) {
  db.items = [
    { id: "it_1", cartId, productSlug: "taza", totalClientCents: 10_000, purchaseOrderId: null },
    { id: "it_2", cartId, productSlug: "gorra", totalClientCents: 5_000, purchaseOrderId: null },
  ];
  db.productos = [
    { slug: "taza", supplier: "midocean" },
    { slug: "gorra", supplier: "makito" },
  ];
}

beforeEach(() => {
  db.items = [];
  db.pos = [];
  db.productos = [];
  db.settings.clear();
  db.seq = 0;
});

describe("createPurchaseOrdersFromCart · reparto normal", () => {
  it("crea un PurchaseOrder por proveedor con el total de sus items", async () => {
    sembrarCarrito("cart_1");

    const pos = await createPurchaseOrdersFromCart("cart_1");

    expect(pos).toHaveLength(2);
    const porProveedor = Object.fromEntries(db.pos.map((p) => [p.supplier, p.totalClientCents]));
    expect(porProveedor).toEqual({ midocean: 10_000, makito: 5_000 });
  });

  it("cada item queda asignado al PO de su proveedor", async () => {
    sembrarCarrito("cart_1");

    await createPurchaseOrdersFromCart("cart_1");

    const poMid = db.pos.find((p) => p.supplier === "midocean")!;
    const poMak = db.pos.find((p) => p.supplier === "makito")!;
    expect(db.items.find((i) => i.id === "it_1")!.purchaseOrderId).toBe(poMid.id);
    expect(db.items.find((i) => i.id === "it_2")!.purchaseOrderId).toBe(poMak.id);
  });

  it("llamarla dos veces SEGUIDAS no duplica nada ni infla el total", async () => {
    // Esta es la idempotencia que el código sí tiene: en la segunda pasada los
    // items ya llevan purchaseOrderId y se saltan.
    sembrarCarrito("cart_1");

    await createPurchaseOrdersFromCart("cart_1");
    await createPurchaseOrdersFromCart("cart_1");

    expect(db.pos).toHaveLength(2);
    const total = db.pos.reduce((s, p) => s + p.totalClientCents, 0);
    expect(total).toBe(15_000);
  });

  it("un carrito sin items no crea ningún PO", async () => {
    const pos = await createPurchaseOrdersFromCart("cart_vacio");
    expect(pos).toEqual([]);
    expect(db.pos).toHaveLength(0);
  });
});

describe("createPurchaseOrdersFromCart · dos ejecuciones SOLAPADAS", () => {
  it("no crea dos PurchaseOrder del mismo proveedor para el mismo carrito", async () => {
    // El webhook de Stripe llama a esta función desde dos ramas del mismo pago,
    // y el panel tiene un botón «split». Dos ejecuciones que empiecen a la vez
    // leen los items todavía sin asignar y ambas crean su PO.
    //
    // Duplicar aquí no es cosmético: cada `*-auto-order` busca EL PO de su
    // proveedor y luego filtra los items por ese id. Si los items acabaron
    // colgando del otro PO, el pedido se queda sin items y NO SE CURSA — el
    // cliente ha pagado y no se pide nada.
    sembrarCarrito("cart_1");

    await Promise.all([
      createPurchaseOrdersFromCart("cart_1"),
      createPurchaseOrdersFromCart("cart_1"),
    ]);

    const midocean = db.pos.filter((p) => p.supplier === "midocean");
    expect(midocean).toHaveLength(1);
  });

  it("el total de los PO sigue siendo el del carrito, sin inflarse", async () => {
    sembrarCarrito("cart_1");

    await Promise.all([
      createPurchaseOrdersFromCart("cart_1"),
      createPurchaseOrdersFromCart("cart_1"),
    ]);

    const total = db.pos.reduce((s, p) => s + p.totalClientCents, 0);
    expect(total).toBe(15_000);
  });

  it("ningún item se queda sin PO tras el solape", async () => {
    sembrarCarrito("cart_1");

    await Promise.all([
      createPurchaseOrdersFromCart("cart_1"),
      createPurchaseOrdersFromCart("cart_1"),
    ]);

    expect(db.items.every((i) => i.purchaseOrderId !== null)).toBe(true);
  });
});

describe("createPurchaseOrdersFromCart · el carrito cambia después del reparto", () => {
  it("un item añadido más tarde se asigna en la siguiente llamada", async () => {
    // Este es el caso que justifica soltar el cerrojo en `finally`: el reparto
    // no es un acto único. Si el admin añade una línea al carrito y vuelve a
    // repartir, esa línea tiene que acabar en el PO de su proveedor. Con un
    // cerrojo pegado, la segunda llamada devolvería los PO de antes y el item
    // nuevo se quedaría sin asignar — y un item sin PO no se pide a nadie.
    sembrarCarrito("cart_1");
    await createPurchaseOrdersFromCart("cart_1");

    db.items.push({
      id: "it_3",
      cartId: "cart_1",
      productSlug: "taza",
      totalClientCents: 2_000,
      purchaseOrderId: null,
    });

    await createPurchaseOrdersFromCart("cart_1");

    expect(db.items.find((i) => i.id === "it_3")!.purchaseOrderId).not.toBeNull();
    // Y su importe se suma al PO de MidOcean, sin tocar el de Makito.
    const porProveedor = Object.fromEntries(db.pos.map((p) => [p.supplier, p.totalClientCents]));
    expect(porProveedor).toEqual({ midocean: 12_000, makito: 5_000 });
  });
});
