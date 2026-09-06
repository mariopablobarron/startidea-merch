import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const db = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  payments: new Map<string, Record<string, unknown>>(),
  cart: {} as Record<string, unknown>,
  items: [] as { id: string; cartId: string; quantity: number; variantSku: string;
    purchaseOrderId: string | null; markings: { id: string; colours: number; positionId: string }[] }[],
  failLink: false,
  counter: 0,
  locks: 0,
  txActive: false,
}));
function clone<T>(value: T): T { return structuredClone(value); }
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((v) => matches(row, v));
    if (value && typeof value === "object") {
      if ("in" in value) return (value.in as unknown[]).includes(row[key]);
      if ("equals" in value) return JSON.stringify(row[key]) === JSON.stringify(value.equals);
    }
    return row[key] === value;
  });
}
const mockPrisma = {
  cartQuote: { findUnique: vi.fn(async () => clone({ ...db.cart,
    payments: [...db.payments.values()].filter((p) => p.cartId === db.cart.id && p.status === "PAID") })) },
  cartQuoteItem: { findMany: vi.fn(async ({ where }: { where: { cartId: string } }) =>
    clone(db.items.filter((item) => item.cartId === where.cartId))) },
  adminSetting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => db.settings.has(where.key)
      ? { key: where.key, value: clone(db.settings.get(where.key)) } : null),
    create: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
      if (db.settings.has(data.key)) throw new Error("P2002");
      db.settings.set(data.key, clone(data.value)); return data;
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const key = where.key as string;
      if (!db.settings.has(key) || !matches({ key, value: db.settings.get(key) }, where)) return { count: 0 };
      db.settings.delete(key); return { count: 1 };
    }),
  },
  payment: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => clone(db.payments.get(where.id) ?? null)),
    findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
      clone([...db.payments.values()].filter((p) => matches(p, where)).reverse().slice(0, take))),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const payment = { id: `pay_${++db.counter}`, createdAt: new Date(), stripeSessionId: null,
        stripePaymentIntentId: null, failureReason: null, ...data };
      db.payments.set(payment.id, payment); return clone(payment);
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (db.failLink && ("stripeSessionId" in data || "stripePaymentIntentId" in data)) {
        db.failLink = false; throw new Error("DB temporarily unavailable");
      }
      let count = 0;
      for (const row of db.payments.values()) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    }),
  },
  $executeRaw: vi.fn(async () => 1),
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    db.txActive = true;
    try { return await fn(mockPrisma); } finally { db.txActive = false; }
  }),
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/cron-lock", () => ({
  acquireCronLockLease: vi.fn(async (key: string) => {
    const k = `cron_lock:${key}`;
    if (db.settings.has(k)) return null;
    const token = `owner_${++db.locks}`;
    db.settings.set(k, { token, at: Date.now() }); return token;
  }),
  releaseCronLockLease: vi.fn(async (key: string, owner: string) => {
    const k = `cron_lock:${key}`;
    if ((db.settings.get(k) as { token?: string } | undefined)?.token === owner) db.settings.delete(k);
  }),
}));

type Obj = Record<string, unknown>;
const remote = new Map<string, Obj>();
const idempotent = new Map<string, Obj>();
const create = vi.fn(async (snapshot: import("./payment-attempts").PaymentAttemptSnapshot, options: Stripe.RequestOptions) => {
  expect(db.txActive).toBe(false);
  const key = options.idempotencyKey!;
  if (idempotent.has(key)) return clone(idempotent.get(key));
  const isWallet = snapshot.channel === "wallet";
  const object = { id: `${isWallet ? "pi" : "cs"}_${remote.size + 1}`,
    object: isWallet ? "payment_intent" : "checkout.session", livemode: snapshot.mode === "live",
    currency: "eur", metadata: clone(snapshot.params.metadata),
    ...(isWallet ? { amount: snapshot.params.amount, status: "requires_payment_method", client_secret: "secret_test" }
      : { amount_subtotal: (snapshot.params.line_items as { price_data: { unit_amount: number } }[])[0].price_data.unit_amount,
        amount_total: snapshot.quote.amountCents,
        status: "open", payment_status: "unpaid", url: "https://checkout.stripe.test/session" }),
  };
  remote.set(object.id, object); idempotent.set(key, object); return clone(object);
});
const retrieve = vi.fn(async (id: string) => clone(remote.get(id)));
const cancel = vi.fn(async (id: string) => { const row = remote.get(id)!; row.status = "canceled"; return clone(row); });
const expire = vi.fn(async (id: string) => { const row = remote.get(id)!; row.status = "expired"; return clone(row); });
const stripe = { paymentIntents: { retrieve, cancel }, checkout: { sessions: { retrieve, expire } } } as unknown as Stripe;

async function start(channel: "wallet" | "hosted" = "wallet", extra: Record<string, unknown> = {}) {
  const { startPaymentAttempt } = await import("./payment-attempts");
  const amount = (extra.amountCents as number | undefined) ?? 12_100;
  return startPaymentAttempt({
    stripe, mode: "test", channel,
    cart: { id: "cart_1", acceptedTotalCents: 10_000, depositPercent: 100, paymentLinkToken: "tok" },
    quote: { acceptedTotalCents: 10_000, depositPercent: 100, paymentLinkToken: "tok", amountCents: 12_100,
      currency: "eur", kind: "FULL", taxEnabled: false, ...extra },
    params: channel === "wallet" ? { amount, currency: "eur", receipt_email: "test@example.com" }
      : { mode: "payment", line_items: [{ price_data: { currency: "eur", unit_amount: amount,
        product_data: { name: "Cotización" } }, quantity: 1 }] },
    create: create as unknown as Parameters<typeof startPaymentAttempt>[0]["create"],
  });
}

beforeEach(() => {
  vi.clearAllMocks(); db.settings.clear(); db.payments.clear(); remote.clear(); idempotent.clear();
  db.counter = 0; db.failLink = false;
  db.txActive = false;
  db.cart = { id: "cart_1", acceptedTotalCents: 10_000, depositPercent: 100,
    paymentLinkToken: "tok", paymentLinkExpiresAt: null };
  db.items = [{ id: "item_1", cartId: "cart_1", quantity: 100, variantSku: "variant_original",
    purchaseOrderId: null, markings: [{ id: "mark_1", colours: 1, positionId: "front" }] }];
});

describe("intentos durables Stripe", () => {
  it("reserva Payment y snapshot antes de crear Stripe; vuelve al mismo PI", async () => {
    create.mockImplementationOnce(async (snapshot, options) => {
      expect(db.payments.has(snapshot.paymentId)).toBe(true);
      expect(db.settings.has(`payment_attempt:${snapshot.paymentId}`)).toBe(true);
      expect(options.idempotencyKey).toBe(`merch:test:${snapshot.paymentId}:wallet`);
      const object = { id: "pi_reserved", object: "payment_intent", amount: 12_100,
        livemode: false, currency: "eur", metadata: snapshot.params.metadata,
        status: "requires_payment_method", client_secret: "secret" };
      remote.set(object.id, object); return object;
    });
    const first = await start(); const second = await start();
    expect(first.id).toBe(second.id); expect(db.payments.size).toBe(1); expect(create).toHaveBeenCalledTimes(1);
  });

  it("dos wallet simultáneos no crean dos Payments ni dos PI", async () => {
    let unblock!: () => void;
    const pending = new Promise<void>((resolve) => { unblock = resolve; });
    const implementation = create.getMockImplementation()!;
    create.mockImplementationOnce(async (snapshot, options) => { await pending; return implementation(snapshot, options); });
    const first = start();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await expect(start()).rejects.toMatchObject({ status: 409 });
    unblock(); await first;
    expect(db.payments.size).toBe(1); expect(remote.size).toBe(1);
  });

  it("dos hosted simultáneos no abren sesiones gemelas", async () => {
    let unblock!: () => void;
    const pending = new Promise<void>((resolve) => { unblock = resolve; });
    const implementation = create.getMockImplementation()!;
    create.mockImplementationOnce(async (snapshot, options) => { await pending; return implementation(snapshot, options); });
    const first = start("hosted");
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await expect(start("hosted")).rejects.toMatchObject({ status: 409 });
    unblock(); await first;
    expect(db.payments.size).toBe(1); expect(remote.size).toBe(1);
  });

  it("recupera Stripe creado aunque falle la escritura de su ID", async () => {
    db.failLink = true;
    await expect(start()).rejects.toThrow("DB temporarily");
    expect(remote.size).toBe(1); expect(db.payments.get("pay_1")!.stripePaymentIntentId).toBeNull();
    const recovered = await start();
    expect(remote.size).toBe(1); expect(db.payments.size).toBe(1);
    expect(db.payments.get("pay_1")!.stripePaymentIntentId).toBe(recovered.id);
    expect(create.mock.calls[0][1].idempotencyKey).toBe(create.mock.calls[1][1].idempotencyKey);
    expect(create.mock.calls[0][0].params).toEqual(create.mock.calls[1][0].params);
  });

  it("acepta el mismo ID asociado por webhook antes de responder Stripe", async () => {
    const implementation = create.getMockImplementation()!;
    create.mockImplementationOnce(async (snapshot, options) => {
      const object = await implementation(snapshot, options);
      db.payments.get(snapshot.paymentId)!.stripePaymentIntentId = object!.id;
      return object;
    });
    expect((await start()).id).toBe("pi_1");
  });

  it("no pisa un identificador distinto asociado mientras esperaba Stripe", async () => {
    const implementation = create.getMockImplementation()!;
    create.mockImplementationOnce(async (snapshot, options) => {
      const object = await implementation(snapshot, options);
      db.payments.get(snapshot.paymentId)!.stripePaymentIntentId = "pi_other";
      return object;
    });
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(db.payments.get("pay_1")!.stripePaymentIntentId).toBe("pi_other");
  });

  it("hosted cancela primero wallet no iniciado y conserva su correspondencia", async () => {
    const first = await start();
    const session = await start("hosted");
    expect(session.object).toBe("checkout.session"); expect(cancel).toHaveBeenCalledWith(first.id, {}, expect.anything());
    expect(db.payments.get("pay_1")).toMatchObject({ status: "CANCELED", stripePaymentIntentId: first.id });
    expect(db.payments.get("pay_2")).toMatchObject({ stripeSessionId: session.id, stripePaymentIntentId: null });
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[1]);
  });

  it.each(["processing", "requires_action", "succeeded", "requires_capture"])("no abre hosted si wallet está %s", async (status) => {
    const first = await start(); remote.get(first.id)!.status = status;
    await expect(start("hosted")).rejects.toMatchObject({ status: 409 });
    expect(cancel).not.toHaveBeenCalled(); expect(create).toHaveBeenCalledTimes(1);
  });

  it("no abre hosted ante cancelación fallida o ambigua", async () => {
    await start(); cancel.mockRejectedValueOnce(new Error("timeout"));
    await expect(start("hosted")).rejects.toThrow("timeout");
    expect(create).toHaveBeenCalledTimes(1); expect(db.payments.size).toBe(1);
    cancel.mockResolvedValueOnce({ status: "processing" });
    await expect(start("hosted")).rejects.toMatchObject({ status: 409 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("el montaje wallet no expira hosted abierto; su botón reutiliza la sesión", async () => {
    const first = await start("hosted");
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(expire).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
    expect((await start("hosted")).id).toBe(first.id); expect(create).toHaveBeenCalledTimes(1);
  });

  it("cambio de importe cancela el objeto anterior y deja Payment histórico intacto", async () => {
    const old = await start(); db.cart.acceptedTotalCents = 20_000;
    const current = await start("wallet", { acceptedTotalCents: 20_000, amountCents: 24_200 });
    expect(current.id).not.toBe(old.id);
    expect(db.payments.get("pay_1")).toMatchObject({ amountCents: 12_100, stripePaymentIntentId: old.id, status: "CANCELED" });
    expect(db.payments.get("pay_2")).toMatchObject({ amountCents: 24_200, stripePaymentIntentId: current.id });
  });

  it("cambio de importe hosted expira la sesión abierta antes de crear otra", async () => {
    const old = await start("hosted"); db.cart.acceptedTotalCents = 20_000;
    const current = await start("hosted", { acceptedTotalCents: 20_000, amountCents: 24_200 });
    expect(current.id).not.toBe(old.id); expect(expire).toHaveBeenCalledTimes(1);
    expect(expire.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[1]);
  });

  it("no recrea un intento sin ID después de la ventana idempotente", async () => {
    db.failLink = true; await expect(start()).rejects.toThrow();
    const snapshot = db.settings.get("payment_attempt:pay_1") as Record<string, unknown>;
    snapshot.createdAt = new Date(Date.now() - 25 * 3600_000).toISOString();
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(create).toHaveBeenCalledTimes(1); expect(remote.size).toBe(1);
  });

  it("un intento antiguo con ID conocido sí se recupera sin POST de creación", async () => {
    const first = await start();
    const snapshot = db.settings.get("payment_attempt:pay_1") as Record<string, unknown>;
    snapshot.createdAt = new Date(Date.now() - 40 * 3600_000).toISOString();
    expect((await start()).id).toBe(first.id); expect(create).toHaveBeenCalledTimes(1);
  });

  it("hosted incluye contrato de recuperación también en su PaymentIntent", async () => {
    await start("hosted");
    const snapshot = create.mock.calls[0][0];
    expect(snapshot.params.metadata).toMatchObject({ paymentId: "pay_1", cartId: "cart_1", source: "hosted-checkout",
      kind: "FULL", expectedAmountCents: "12100", taxEnabled: "false", paymentLinkToken: "tok" });
    expect(snapshot.params.payment_intent_data).toEqual({ metadata: snapshot.params.metadata });
  });

  it("no interpreta un fallo de cobro como permiso para perder el intento", async () => {
    const first = await start(); db.payments.get("pay_1")!.status = "FAILED";
    expect((await start()).id).toBe(first.id); expect(create).toHaveBeenCalledTimes(1);
  });

  it("bloquea el carrito pagado o modificado entre consulta y reserva", async () => {
    db.payments.set("paid", { id: "paid", cartId: "cart_1", status: "PAID" });
    await expect(start()).rejects.toMatchObject({ status: 409 });
    db.payments.clear(); db.cart.acceptedTotalCents = 30_000;
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled();
  });

  it("no devuelve acceso si pierde el lease durante Stripe", async () => {
    const implementation = create.getMockImplementation()!;
    create.mockImplementationOnce(async (snapshot, options) => {
      const object = await implementation(snapshot, options);
      db.settings.set("cron_lock:payment-start:test:cart_1", { token: "new_owner" });
      return object;
    });
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(db.settings.get("cron_lock:payment-start:test:cart_1")).toEqual({ token: "new_owner" });
    expect(db.payments.get("pay_1")!.stripePaymentIntentId).toBe("pi_1");
  });

  it("retira wallet antiguo no iniciado y crea un intento con snapshot verificable", async () => {
    db.payments.set("legacy", { id: "legacy", cartId: "cart_1", amountCents: 12_100,
      currency: "EUR", kind: "FULL", status: "PENDING", stripeMode: "test", createdAt: new Date(0),
      stripePaymentIntentId: "pi_legacy", stripeSessionId: null });
    remote.set("pi_legacy", { id: "pi_legacy", object: "payment_intent", livemode: false, amount: 12_100,
      currency: "eur", status: "requires_payment_method", client_secret: "secret", metadata: { cartId: "cart_1" } });
    const current = await start();
    expect(current.id).not.toBe("pi_legacy"); expect(create).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("pi_legacy", {}, expect.anything());
    expect(db.payments.get("legacy")).toMatchObject({ status: "CANCELED", stripePaymentIntentId: "pi_legacy" });
    expect(db.settings.get("payment_attempt:legacy")).toMatchObject({ legacy: true, channel: "wallet" });
    expect(db.settings.get("payment_attempt:pay_1")).toMatchObject({ quote: { itemsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  });

  it.each(["processing", "succeeded"])("wallet antiguo %s nunca se presume compatible con la cotización actual", async (status) => {
    db.payments.set("legacy", { id: "legacy", cartId: "cart_1", amountCents: 12_100,
      currency: "EUR", kind: "FULL", status: "PENDING", stripeMode: "test", createdAt: new Date(0),
      stripePaymentIntentId: "pi_legacy", stripeSessionId: null });
    remote.set("pi_legacy", { id: "pi_legacy", object: "payment_intent", livemode: false, amount: 12_100,
      currency: "eur", status, client_secret: "secret", metadata: { cartId: "cart_1" } });
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
    expect(db.payments.get("legacy")).toMatchObject({ status: "PENDING", stripePaymentIntentId: "pi_legacy" });
    expect(db.settings.get("payment_attempt:legacy")).toMatchObject({ legacy: true });
  });

  it.each(["cantidad", "variante", "marcaje"])("cambio de %s con precio constante invalida el intento anterior", async (change) => {
    const old = await start();
    const oldSnapshot = clone(db.settings.get("payment_attempt:pay_1"));
    if (change === "cantidad") db.items[0].quantity++;
    if (change === "variante") db.items[0].variantSku = "variant_changed";
    if (change === "marcaje") db.items[0].markings[0].colours++;
    const current = await start();
    expect(current.id).not.toBe(old.id);
    expect(db.payments.get("pay_1")).toMatchObject({ amountCents: 12_100, status: "CANCELED", stripePaymentIntentId: old.id });
    expect(db.payments.get("pay_2")).toMatchObject({ amountCents: 12_100, status: "PENDING", stripePaymentIntentId: current.id });
    expect(db.settings.get("payment_attempt:pay_1")).toEqual(oldSnapshot);
    const previous = oldSnapshot as { quote: { itemsFingerprint: string } };
    const next = db.settings.get("payment_attempt:pay_2") as { quote: { itemsFingerprint: string } };
    expect(next.quote.itemsFingerprint).not.toBe(previous.quote.itemsFingerprint);
  });

  it("asignar purchaseOrderId no invalida el intento ni su huella", async () => {
    const original = await start();
    db.items[0].purchaseOrderId = "po_assigned";
    expect((await start()).id).toBe(original.id);
    expect(create).toHaveBeenCalledTimes(1); expect(cancel).not.toHaveBeenCalled();
  });

  it("cambio de composición durante la creación no devuelve acceso al intento anterior", async () => {
    const implementation = create.getMockImplementation()!;
    create.mockImplementationOnce(async (snapshot, options) => {
      const object = await implementation(snapshot, options);
      db.items[0].quantity++;
      return object;
    });
    const current = await start();
    expect(current.id).toBe("pi_2");
    expect(remote.get("pi_1")!.status).toBe("canceled");
    expect(db.payments.get("pay_1")).toMatchObject({ status: "CANCELED", stripePaymentIntentId: "pi_1" });
    expect(db.payments.size).toBe(2);
  });

  it("varios intentos históricos sin seleccionar exigen revisión", async () => {
    for (const id of ["old1", "old2"]) db.payments.set(id, {
      id, cartId: "cart_1", status: "PENDING", stripeMode: "test", stripePaymentIntentId: `pi_${id}`,
    });
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(create).not.toHaveBeenCalled(); expect(retrieve).not.toHaveBeenCalled();
  });

  it("un intento de otro canal sin ID no abre otro objeto", async () => {
    db.failLink = true; await expect(start()).rejects.toThrow();
    await expect(start("hosted")).rejects.toMatchObject({ status: 409 });
    expect(create).toHaveBeenCalledTimes(1); expect(remote.size).toBe(1);
  });

  it.each(["livemode", "currency", "metadata", "amount"])("bloquea objeto remoto con %s incoherente", async (field) => {
    const first = await start();
    remote.get(first.id)![field] = ({ livemode: true, currency: "usd", metadata: { cartId: "other" }, amount: 1 })[field];
    await expect(start()).rejects.toMatchObject({ status: 409 });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
