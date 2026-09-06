import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Se ejecuta la ruta de verdad; sólo Stripe, persistencia y transportes son
// dobles. Los estados sobreviven entre entregas para detectar sellos prematuros
// y efectos duplicados que un findUnique.mockResolvedValue fijo escondería.
const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveIntent: vi.fn(),
  retrieveCharge: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentUpdateMany: vi.fn(),
  cartFindUnique: vi.fn(),
  cartItemFindMany: vi.fn(),
  cartUpdate: vi.fn(),
  eventCreate: vi.fn(),
  eventFindUnique: vi.fn(),
  eventDelete: vi.fn(),
  adminSettingFindUnique: vi.fn(),
  adminSettingUpsert: vi.fn(),
  transaction: vi.fn(),
  enqueueStripePostPayment: vi.fn(),
  processStripePostPayment: vi.fn(),
  afterCallbacks: [] as Array<() => Promise<unknown>>,
  sendEmail: vi.fn(),
  emitWebhook: vi.fn(),
  notifyTelegram: vi.fn(),
  markReferralEarned: vi.fn(),
  recordCouponRedemption: vi.fn(),
  autoPlaceMidoceanOrder: vi.fn(),
  autoPlaceCifraOrder: vi.fn(),
  autoPlaceMakitoOrder: vi.fn(),
  createPurchaseOrdersFromCart: vi.fn(),
  createPostPaymentMagicLink: vi.fn(),
  syncPaymentToFacturaScripts: vi.fn(),
}));

vi.mock("next/server", async () => ({
  ...await vi.importActual<typeof import("next/server")>("next/server"),
  after: (callback: () => Promise<unknown>) => mocks.afterCallbacks.push(callback),
}));
vi.mock("@/lib/stripe-post-payment", () => ({
  enqueueStripePostPayment: mocks.enqueueStripePostPayment,
  processStripePostPayment: mocks.processStripePostPayment,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: {
      findUnique: mocks.paymentFindUnique,
      findFirst: mocks.paymentFindFirst,
      update: mocks.paymentUpdate,
      updateMany: mocks.paymentUpdateMany,
    },
    cartQuote: { findUnique: mocks.cartFindUnique, update: mocks.cartUpdate },
    cartQuoteItem: { findMany: mocks.cartItemFindMany },
    processedStripeEvent: {
      create: mocks.eventCreate,
      findUnique: mocks.eventFindUnique,
      delete: mocks.eventDelete,
    },
    adminSetting: { findUnique: mocks.adminSettingFindUnique, upsert: mocks.adminSettingUpsert },
    couponRedemption: { findUnique: vi.fn(async () => null) },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/stripe", () => ({
  STRIPE_WEBHOOK_SECRET: "whsec_local_test_only",
  stripe: {
    webhooks: { constructEvent: mocks.constructEvent },
    paymentIntents: { retrieve: mocks.retrieveIntent },
    charges: { retrieve: mocks.retrieveCharge },
  },
}));
vi.mock("@/lib/resend", () => ({ sendEmail: mocks.sendEmail, RESEND_TO_INTERNAL: "internal@example.test" }));
vi.mock("@/lib/webhooks", () => ({ emitWebhook: mocks.emitWebhook }));
vi.mock("@/lib/telegram", () => ({ notifyTelegram: mocks.notifyTelegram, escapeTgHtml: (value: string) => value }));
vi.mock("@/lib/referral", () => ({ markReferralEarned: mocks.markReferralEarned }));
vi.mock("@/lib/affiliates", () => ({ recordCouponRedemption: mocks.recordCouponRedemption }));
vi.mock("@/lib/midocean-auto-order", () => ({ autoPlaceMidoceanOrder: mocks.autoPlaceMidoceanOrder }));
vi.mock("@/lib/cifra-auto-order", () => ({ autoPlaceCifraOrder: mocks.autoPlaceCifraOrder }));
vi.mock("@/lib/makito-auto-order", () => ({ autoPlaceMakitoOrder: mocks.autoPlaceMakitoOrder }));
vi.mock("@/lib/purchase-orders", () => ({ createPurchaseOrdersFromCart: mocks.createPurchaseOrdersFromCart }));
vi.mock("@/lib/customer-portal-magic", () => ({ createPostPaymentMagicLink: mocks.createPostPaymentMagicLink }));
vi.mock("@/lib/facturascripts-sync", () => ({ syncPaymentToFacturaScripts: mocks.syncPaymentToFacturaScripts }));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
let payments: Row[];
let cart: Row;
let receipts: Map<string, Row>;
let jobs: Map<string, Row>;
let settings: Map<string, Row>;
let transactionTail: Promise<unknown>;
const BASE_ITEMS = [{
  id: "item_local_1", cartId: "cart_local_1", productSlug: "producto-local", productRef: "PUBLIC-1",
  quantity: 100, variantSku: "VAR-A", unitPriceClientCents: 100, totalClientCents: 10000,
  markingTechniqueCode: "S1", markingPositionId: "FRONT", markingColours: 1,
  purchaseOrderId: null as string | null,
  markings: [{ id: "mark_local_1", itemId: "item_local_1", positionId: "FRONT", techniqueCode: "S1", numberOfColors: 1, order: 0 }],
}];
// SHA-256 del fixture canónico, sin purchaseOrderId. Es un literal independiente
// del helper productivo: omitir cantidad/variante/marcaje debe romper los casos.
const BASE_ITEMS_FINGERPRINT = "ef0b50868f3cb4ac2f8d262f98ab7ef427345e4ac5bd497c2e6bc7e50367645d";
let items: typeof BASE_ITEMS;

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Where[]).some((item) => matches(row, item));
    if (key === "AND") return (value as Where[]).every((item) => matches(row, item));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const condition = value as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
      if (condition.in) return condition.in.includes(row[key]);
      if (condition.notIn) return !condition.notIn.includes(row[key]);
      if ("not" in condition) return row[key] !== condition.not;
    }
    return value === undefined || row[key] === value;
  });
}

function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) row[key] = value;
  }
}

function seedPayment(data: Row = {}) {
  const payment = {
    id: "pay_local_1", cartId: "cart_local_1", amountCents: 12100,
    currency: "EUR", kind: "FULL", status: "PENDING",
    stripeSessionId: "cs_local_1", stripePaymentIntentId: null, stripeMode: "test",
    ...data,
  };
  payments.push(payment);
  const key = `payment_attempt:${payment.id}`;
  settings.set(key, { key, value: {
    version: 1, paymentId: payment.id, cartId: payment.cartId, mode: payment.stripeMode,
    channel: payment.stripeSessionId ? "hosted" : "wallet", createdAt: "2026-09-05T12:00:00.000Z",
    quote: {
      acceptedTotalCents: cart.acceptedTotalCents, depositPercent: cart.depositPercent,
      paymentLinkToken: cart.paymentLinkToken, amountCents: payment.amountCents,
      currency: "eur", kind: payment.kind, taxEnabled: false, itemsFingerprint: BASE_ITEMS_FINGERPRINT,
    }, params: {},
  } });
  return payment;
}

function sessionEvent(type: string, paymentStatus = "paid", eventId = `evt_${type}_${paymentStatus}`) {
  return {
    id: eventId, type, livemode: false,
    data: { object: {
      id: "cs_local_1", object: "checkout.session", mode: "payment",
      status: "complete", payment_status: paymentStatus,
      payment_intent: "pi_local_1", amount_total: 12100, currency: "eur",
      metadata: { cartId: "cart_local_1" },
    } },
  };
}

function intentEvent(type: string, eventId = `evt_${type}`) {
  return { id: eventId, type, livemode: false, data: { object: {
    id: "pi_local_1", object: "payment_intent", status: type === "payment_intent.succeeded" ? "succeeded" : "requires_payment_method",
    amount: 12100, amount_received: 12100, currency: "eur", latest_charge: "ch_local_1",
    metadata: { cartId: "cart_local_1", via: "express-checkout" },
    last_payment_error: { message: "Falló un intento anterior" },
  } } };
}

function refundEvent(full: boolean) {
  return { id: `evt_refund_${full}`, type: "charge.refunded", livemode: false, data: { object: {
    id: "ch_local_1", object: "charge", payment_intent: "pi_local_1", refunded: full,
    amount: 12100, amount_refunded: full ? 12100 : 1000, currency: "eur",
    metadata: { cartId: "cart_local_1", paymentId: "pay_local_1" },
  } } };
}

async function deliver(event: unknown, signed = true) {
  const response = await POST(new Request("https://example.test/api/webhooks/stripe", {
    method: "POST", body: JSON.stringify(event),
    headers: signed ? { "stripe-signature": "local_signature" } : {},
  }));
  for (const callback of mocks.afterCallbacks.splice(0)) await callback();
  // Vacía las continuaciones en memoria de efectos asíncronos; no red ni sleep.
  await Promise.resolve();
  await Promise.resolve();
  return response;
}

function expectNoPostPaymentEffects() {
  expect(jobs.size).toBe(0);
  expect(mocks.processStripePostPayment).not.toHaveBeenCalled();
  for (const effect of [mocks.sendEmail, mocks.emitWebhook, mocks.notifyTelegram,
    mocks.markReferralEarned, mocks.createPurchaseOrdersFromCart,
    mocks.autoPlaceMidoceanOrder, mocks.autoPlaceCifraOrder, mocks.autoPlaceMakitoOrder,
    mocks.createPostPaymentMagicLink, mocks.syncPaymentToFacturaScripts]) {
    expect(effect).not.toHaveBeenCalled();
  }
}

function expectOnePostPaymentFlow() {
  expect(jobs.size).toBe(1);
  expect(mocks.enqueueStripePostPayment).toHaveBeenCalledTimes(1);
  expect(mocks.processStripePostPayment).toHaveBeenCalledWith("pay_local_1");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("FACTURASCRIPTS_SYNC_ENABLED", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  payments = [];
  receipts = new Map();
  jobs = new Map();
  settings = new Map();
  items = structuredClone(BASE_ITEMS);
  mocks.afterCallbacks.length = 0;
  transactionTail = Promise.resolve();
  mocks.constructEvent.mockImplementation((body: string) => JSON.parse(body));
  cart = { id: "cart_local_1", status: "ACCEPTED", name: "Cliente de prueba",
    email: "client@example.test", company: null, acceptedTotalCents: 10000,
    depositPercent: 100, paymentLinkToken: "pay_token_current", internalNotes: "Nota previa", items: [] };
  mocks.paymentFindUnique.mockImplementation(async ({ where }: { where: Where }) => {
    const payment = payments.find((row) => matches(row, where));
    return payment ? { ...payment, cart: { ...cart } } : null;
  });
  mocks.paymentFindFirst.mockImplementation((...args: unknown[]) => mocks.paymentFindUnique(...args));
  mocks.paymentUpdate.mockImplementation(async ({ where, data }: { where: Where; data: Row }) => {
    const payment = payments.find((row) => matches(row, where));
    if (!payment) throw new Error("Payment not found");
    apply(payment, data);
    return { ...payment, cart: { ...cart } };
  });
  mocks.paymentUpdateMany.mockImplementation(async ({ where, data }: { where: Where; data: Row }) => {
    const found = payments.filter((row) => matches(row, where));
    found.forEach((row) => apply(row, data));
    return { count: found.length };
  });
  mocks.cartFindUnique.mockImplementation(async () => ({ ...cart }));
  mocks.cartItemFindMany.mockImplementation(async () => structuredClone(items));
  mocks.cartUpdate.mockImplementation(async ({ data }: { data: Row }) => { apply(cart, data); return { ...cart }; });
  mocks.eventCreate.mockImplementation(async ({ data }: { data: Row }) => {
    const id = data.eventId as string;
    if (receipts.has(id)) throw Object.assign(new Error("Unique constraint failed (P2002)"), { code: "P2002" });
    const row = { processedAt: new Date(), ...data };
    receipts.set(id, row);
    return row;
  });
  mocks.eventFindUnique.mockImplementation(async ({ where }: { where: Row }) => receipts.get(where.eventId as string) ?? null);
  mocks.eventDelete.mockImplementation(async ({ where }: { where: Row }) => { const row = receipts.get(where.eventId as string); receipts.delete(where.eventId as string); return row; });
  mocks.adminSettingFindUnique.mockImplementation(async ({ where }: { where: Row }) => settings.get(where.key as string) ?? null);
  mocks.adminSettingUpsert.mockImplementation(async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
    const key = where.key as string;
    const existing = settings.get(key);
    if (existing) { apply(existing, update); return { ...existing }; }
    settings.set(key, { ...create });
    return { ...create };
  });
  mocks.transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => {
    const operation = transactionTail.then(async () => {
      const snapshot = structuredClone({ payments, cart, receipts, jobs, settings, items });
      try { return await callback(prisma); }
      catch (error) { ({ payments, cart, receipts, jobs, settings, items } = snapshot); throw error; }
    });
    transactionTail = operation.catch(() => undefined);
    return operation;
  });
  mocks.enqueueStripePostPayment.mockImplementation(async (_tx: unknown, args: Row) => {
    if (!jobs.has(args.paymentId as string)) jobs.set(args.paymentId as string, { ...args });
  });
  mocks.processStripePostPayment.mockResolvedValue(undefined);
  mocks.retrieveIntent.mockResolvedValue({ id: "pi_local_1", status: "succeeded", latest_charge: { receipt_url: "https://example.test/receipt" } });
  mocks.retrieveCharge.mockResolvedValue({ receipt_url: "https://example.test/receipt" });
  for (const effect of [mocks.sendEmail, mocks.emitWebhook, mocks.notifyTelegram,
    mocks.markReferralEarned, mocks.recordCouponRedemption, mocks.autoPlaceMidoceanOrder,
    mocks.autoPlaceCifraOrder, mocks.autoPlaceMakitoOrder]) effect.mockResolvedValue(true);
  mocks.createPurchaseOrdersFromCart.mockResolvedValue([]);
  mocks.createPostPaymentMagicLink.mockResolvedValue("https://example.test/portal/local");
  mocks.syncPaymentToFacturaScripts.mockResolvedValue({ ok: true });
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Stripe webhook · confirmación y reentrega seguras", () => {
  it("rechaza una entrega sin firma sin persistir ni ejecutar efectos", async () => {
    seedPayment();
    const response = await deliver(sessionEvent("checkout.session.completed"), false);
    expect(response.status).toBe(400);
    expect(receipts.size).toBe(0);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expectNoPostPaymentEffects();
  });

  it("rechaza una firma inválida antes de crear el recibo", async () => {
    seedPayment();
    mocks.constructEvent.mockImplementationOnce(() => { throw new Error("Invalid signature"); });
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(400);
    expect(receipts.size).toBe(0);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("completed/unpaid no acredita cobro ni confirma pedido ni activa postpago", async () => {
    seedPayment();
    const response = await deliver(sessionEvent("checkout.session.completed", "unpaid"));
    expect(response.status).toBe(200);
    expect(payments[0].status).toBe("PENDING");
    expect(cart.status).toBe("ACCEPTED");
    expectNoPostPaymentEffects();
  });

  it("no_payment_required no convierte una cotización monetaria en PAID", async () => {
    seedPayment();
    const response = await deliver(sessionEvent("checkout.session.completed", "no_payment_required"));
    expect(response.status).toBe(200);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("la confirmación asíncrona tras completed/unpaid acredita y ejecuta postpago una vez", async () => {
    seedPayment();
    await deliver(sessionEvent("checkout.session.completed", "unpaid"));
    const response = await deliver(sessionEvent("checkout.session.async_payment_succeeded"));
    expect(response.status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(cart.status).toBe("CONFIRMED");
    expectOnePostPaymentFlow();
  });

  it("reentregar un evento finalizado no repite emails, pedidos ni notificaciones", async () => {
    seedPayment();
    const event = sessionEvent("checkout.session.completed");
    expect((await deliver(event)).status).toBe(200);
    expect((await deliver(event)).status).toBe(200);
    expectOnePostPaymentFlow();
    expect(payments[0].status).toBe("PAID");
  });

  it("dos eventos paid distintos de la misma sesión no repiten postpago", async () => {
    seedPayment();
    await deliver(sessionEvent("checkout.session.async_payment_succeeded"));
    await deliver(sessionEvent("checkout.session.completed"));
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it("dos entregas concurrentes de confirmación sólo guardan un trabajo postpago", async () => {
    seedPayment();
    const responses = await Promise.all([
      deliver(sessionEvent("checkout.session.completed")),
      deliver(sessionEvent("checkout.session.async_payment_succeeded")),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it("un evento tardío failed o expired no revierte un cobro confirmado", async () => {
    seedPayment();
    await deliver(sessionEvent("checkout.session.completed"));
    await deliver(sessionEvent("checkout.session.async_payment_failed", "unpaid"));
    await deliver(sessionEvent("checkout.session.expired", "unpaid"));
    expect(payments[0].status).toBe("PAID");
    expect(cart.status).toBe("CONFIRMED");
    expectOnePostPaymentFlow();
  });

  it("una confirmación paid posterior a failure acredita el pago una sola vez", async () => {
    seedPayment();
    await deliver(sessionEvent("checkout.session.async_payment_failed", "unpaid"));
    expect(payments[0].status).toBe("FAILED");
    expectNoPostPaymentEffects();
    await deliver(sessionEvent("checkout.session.async_payment_succeeded"));
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it("un completed tardío no vuelve a acreditar un pago reembolsado", async () => {
    seedPayment({ status: "REFUNDED", stripePaymentIntentId: "pi_local_1" });
    const response = await deliver(sessionEvent("checkout.session.completed"));
    expect(response.status).toBe(200);
    expect(payments[0].status).toBe("REFUNDED");
    expectNoPostPaymentEffects();
  });

  it("un reembolso completo recibido antes del éxito conserva REFUNDED cuando llega el éxito tardío", async () => {
    seedPayment({ stripePaymentIntentId: "pi_local_1" });
    expect((await deliver(refundEvent(true))).status).toBe(200);
    expect(payments[0].status).toBe("REFUNDED");
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("REFUNDED");
    expectNoPostPaymentEffects();
  });

  it("un reembolso parcial no declara todo el Payment reembolsado", async () => {
    seedPayment({ status: "PAID", stripePaymentIntentId: "pi_local_1" });
    expect((await deliver(refundEvent(false))).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(settings.has("stripe_full_refund:test:pi_local_1")).toBe(false);
    expectNoPostPaymentEffects();
  });

  it.each(["hosted", "wallet"])("conserva un reembolso completo sin asociación y evita fulfillment cuando llega %s paid", async (channel) => {
    seedPayment({ stripeSessionId: channel === "hosted" ? "cs_local_1" : null, stripePaymentIntentId: null });
    const refund = refundEvent(true);
    Object.assign(refund.data.object, { metadata: {} });
    expect((await deliver(refund)).status).toBe(200);
    expect(settings.has("stripe_full_refund:test:pi_local_1")).toBe(true);
    expect(payments[0].status).toBe("PENDING");
    const success = channel === "hosted" ? sessionEvent("checkout.session.completed") : intentEvent("payment_intent.succeeded");
    Object.assign(success.data.object.metadata, { paymentId: "pay_local_1" });
    expect((await deliver(success)).status).toBe(200);
    expect(payments[0].status).toBe("REFUNDED");
    expect(payments[0].stripePaymentIntentId).toBe("pi_local_1");
    expect(cart.status).toBe("ACCEPTED");
    expectNoPostPaymentEffects();
  });

  it("un marcador de reembolso live no se aplica a una confirmación test", async () => {
    seedPayment();
    const refund = refundEvent(true);
    refund.livemode = true;
    Object.assign(refund.data.object, { metadata: {} });
    expect((await deliver(refund)).status).toBe(200);
    expect(settings.has("stripe_full_refund:live:pi_local_1")).toBe(true);
    expect(settings.has("stripe_full_refund:test:pi_local_1")).toBe(false);
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it("un reembolso propio sin Payment devuelve 500 y revierte marcador y recibo para reentrega", async () => {
    const refund = refundEvent(true);
    expect((await deliver(refund)).status).toBe(500);
    expect(settings.has("stripe_full_refund:test:pi_local_1")).toBe(false);
    expect(receipts.has(refund.id)).toBe(false);
    expectNoPostPaymentEffects();
    seedPayment({ stripePaymentIntentId: "pi_local_1" });
    expect((await deliver(refund)).status).toBe(200);
    expect(payments[0].status).toBe("REFUNDED");
    expect(settings.has("stripe_full_refund:test:pi_local_1")).toBe(true);
    expectNoPostPaymentEffects();
  });

  it("un reembolso identificado por metadata conserva el PI remoto aunque ya sea REFUNDED al llegar la sesión", async () => {
    seedPayment({ stripePaymentIntentId: null });
    expect((await deliver(refundEvent(true))).status).toBe(200);
    expect(payments[0].status).toBe("REFUNDED");
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].stripePaymentIntentId).toBe("pi_local_1");
    expect(payments[0].status).toBe("REFUNDED");
    expectNoPostPaymentEffects();
  });

  it("un fallo de BD durante la confirmación devuelve 500 y permite recuperar la entrega", async () => {
    seedPayment();
    mocks.cartUpdate.mockRejectedValueOnce(new Error("DB temporalmente no disponible"));
    const event = sessionEvent("checkout.session.completed");
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(cart.status).toBe("CONFIRMED");
    expectOnePostPaymentFlow();
  });

  it("la sesión recibida antes de su Payment queda recuperable, sin descartar el evento", async () => {
    const event = sessionEvent("checkout.session.completed");
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expectNoPostPaymentEffects();
    seedPayment();
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it.each([
    ["checkout.session.async_payment_failed", "FAILED"],
    ["checkout.session.expired", "CANCELED"],
  ])("%s anterior al Payment conserva posibilidad de registrar %s en reentrega", async (type, expectedStatus) => {
    const event = sessionEvent(type, "unpaid");
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expectNoPostPaymentEffects();
    seedPayment();
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].status).toBe(expectedStatus);
    expectNoPostPaymentEffects();
  });

  it.each([
    ["importe", { amount_total: 12099 }],
    ["moneda", { currency: "usd" }],
  ])("no confirma ni sella una sesión cuya %s no coincide con Payment", async (_label, patch) => {
    seedPayment();
    const event = sessionEvent("checkout.session.completed");
    Object.assign(event.data.object, patch);
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expect(cart.status).toBe("ACCEPTED");
    expectNoPostPaymentEffects();
  });

  it("un evento live no confirma un Payment de modo test", async () => {
    seedPayment({ stripeMode: "test" });
    const event = sessionEvent("checkout.session.completed");
    event.livemode = true;
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it.each(["hosted", "wallet"])("recupera por metadata.paymentId el intento %s reservado antes de guardar su ID Stripe", async (channel) => {
    seedPayment({ stripeSessionId: null, stripePaymentIntentId: null });
    const event = channel === "hosted"
      ? sessionEvent("checkout.session.completed")
      : intentEvent("payment_intent.succeeded");
    Object.assign(event.data.object.metadata, { paymentId: "pay_local_1" });
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(payments[0][channel === "hosted" ? "stripeSessionId" : "stripePaymentIntentId"])
      .toBe(channel === "hosted" ? "cs_local_1" : "pi_local_1");
    expectOnePostPaymentFlow();
  });

  it("metadata no permite reasociar a otro carrito una reserva sin ID remoto", async () => {
    seedPayment({ stripeSessionId: null });
    const event = sessionEvent("checkout.session.completed");
    Object.assign(event.data.object.metadata, { paymentId: "pay_local_1", cartId: "cart_ajeno" });
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].stripeSessionId).toBeNull();
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("metadata no sobrescribe una correspondencia Stripe ya asignada a otro objeto", async () => {
    seedPayment({ stripeSessionId: "cs_previa" });
    const event = sessionEvent("checkout.session.completed");
    Object.assign(event.data.object.metadata, { paymentId: "pay_local_1" });
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].stripeSessionId).toBe("cs_previa");
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it.each([
    ["cartId", "cart_ajeno"],
    ["paymentId", "pay_ajeno"],
  ])("rechaza metadata.%s incompatible aunque encuentre Payment por el ID remoto", async (field, value) => {
    seedPayment();
    const event = sessionEvent("checkout.session.completed");
    Object.assign(event.data.object.metadata, { [field]: value });
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("un cobro adicional del mismo carrito queda PAID para conciliar y no cursa otro pedido", async () => {
    seedPayment({ id: "pay_previo", status: "PAID", stripeSessionId: "cs_previa", stripePaymentIntentId: "pi_previo" });
    seedPayment();
    cart.status = "ORDERED";
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[1].status).toBe("PAID");
    expect(payments[1].failureReason).toContain("Pago confirmado adicional");
    expect(cart.status).toBe("ORDERED");
    expect(cart.internalNotes).toContain("Nota previa");
    expect(cart.internalNotes).toContain("[Pago pay_local_1] Pago confirmado adicional");
    expectNoPostPaymentEffects();
  });

  it("un propietario previo de fulfillment conserva la revisión aunque su pago esté reembolsado", async () => {
    seedPayment({ id: "pay_previo", status: "REFUNDED", stripeSessionId: "cs_previa", stripePaymentIntentId: "pi_previo" });
    seedPayment();
    settings.set("stripe_post_payment_cart:cart_local_1", {
      key: "stripe_post_payment_cart:cart_local_1", value: { paymentId: "pay_previo" },
    });
    cart.status = "ORDERED";
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("REFUNDED");
    expect(payments[1].status).toBe("PAID");
    expect(payments[1].failureReason).toEqual(expect.any(String));
    expect(String(payments[1].failureReason).toLowerCase()).toContain("revis");
    expect(cart.status).toBe("ORDERED");
    expect(cart.internalNotes).toContain("Nota previa");
    expect(cart.internalNotes).toContain("[Pago pay_local_1]");
    expect(settings.get("stripe_post_payment_cart:cart_local_1")?.value).toEqual({ paymentId: "pay_previo" });
    expectNoPostPaymentEffects();
  });

  it.each([
    ["acceptedTotalCents", 9000],
    ["depositPercent", 50],
    ["paymentLinkToken", "pay_token_previous"],
  ])("un cobro sobre %s anterior registra revisión sin cursar el pedido", async (field, previousValue) => {
    seedPayment();
    const snapshot = settings.get("payment_attempt:pay_local_1")!.value as { quote: Row };
    snapshot.quote[field] = previousValue;
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(payments[0].failureReason).toContain("una versión anterior");
    expect(cart.status).toBe("ACCEPTED");
    expect(cart.internalNotes).toContain("Nota previa");
    expect(cart.internalNotes).toContain("[Pago pay_local_1] Pago confirmado sobre una versión anterior");
    expectNoPostPaymentEffects();
  });

  it.each(["ausente", "legacy", "sin huella", "inválido"])("un snapshot %s conserva el cobro pero exige revisión sin fulfillment", async (condition) => {
    seedPayment();
    const key = "payment_attempt:pay_local_1";
    const snapshot = settings.get(key)!.value as Row & { quote: Row };
    if (condition === "ausente") settings.delete(key);
    if (condition === "legacy") snapshot.legacy = true;
    if (condition === "sin huella") delete snapshot.quote.itemsFingerprint;
    if (condition === "inválido") snapshot.version = 99;
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(payments[0].failureReason).toContain("sin versión original verificable");
    expect(cart.status).toBe("ACCEPTED");
    expect(cart.internalNotes).toContain("sin versión original verificable");
    expectNoPostPaymentEffects();
  });

  it.each([
    ["cantidad", { quantity: 101 }],
    ["variante", { variantSku: "VAR-B" }],
    ["marcaje", { markingPositionId: "BACK" }],
  ])("un cambio de %s con el mismo precio exige revisión antes de cursar el pedido", async (_label, patch) => {
    seedPayment();
    Object.assign(items[0], patch);
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(payments[0].amountCents).toBe(12100);
    expect(cart.acceptedTotalCents).toBe(10000);
    expect(items[0].totalClientCents).toBe(10000);
    expect(payments[0].failureReason).toContain("una versión anterior");
    expect(cart.internalNotes).toContain("una versión anterior");
    expectNoPostPaymentEffects();
  });

  it("un cambio de marca adicional con el mismo precio exige revisión", async () => {
    seedPayment();
    items[0].markings[0].numberOfColors = 2;
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(payments[0].failureReason).toContain("una versión anterior");
    expect(items[0].totalClientCents).toBe(10000);
    expectNoPostPaymentEffects();
  });

  it("asignar el artículo a un pedido de compra no altera la huella comercial", async () => {
    seedPayment();
    items[0].purchaseOrderId = "po_local_1";
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(payments[0].failureReason).toBeNull();
    expect(items[0].purchaseOrderId).toBe("po_local_1");
    expectOnePostPaymentFlow();
  });

  it("Stripe Tax conserva el subtotal previsto y registra como cobrado el total definitivo", async () => {
    seedPayment({ amountCents: 10000 });
    const event = sessionEvent("checkout.session.completed");
    Object.assign(event.data.object, { amount_total: 12100, amount_subtotal: 10000, automatic_tax: { enabled: true } });
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].amountCents).toBe(12100);
    expect(cart.acceptedTotalCents).toBe(10000);
    expect(jobs.get("pay_local_1")?.amountCents).toBe(12100);
    expectOnePostPaymentFlow();
  });

  it("un total superior sin Stripe Tax válido no se acepta como cobro de la cotización", async () => {
    seedPayment({ amountCents: 10000 });
    const event = sessionEvent("checkout.session.completed");
    Object.assign(event.data.object, { amount_total: 12100, amount_subtotal: 10000, automatic_tax: { enabled: false } });
    expect((await deliver(event)).status).toBe(500);
    expect(payments[0].amountCents).toBe(10000);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("un conflicto de serialización recuperable reintenta la transacción sin duplicar el trabajo", async () => {
    seedPayment();
    mocks.transaction.mockRejectedValueOnce(Object.assign(new Error("Serialization conflict"), { code: "P2034" }));
    expect((await deliver(sessionEvent("checkout.session.completed"))).status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it("un conflicto persistente limita los reintentos y responde 500 sin sellar el evento", async () => {
    seedPayment();
    mocks.transaction.mockRejectedValue(Object.assign(new Error("Serialization conflict"), { code: "P2034" }));
    const event = sessionEvent("checkout.session.completed");
    expect((await deliver(event)).status).toBe(500);
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("un error al registrar la entrega devuelve 500 sin cambios comerciales", async () => {
    seedPayment();
    mocks.eventCreate.mockRejectedValueOnce(new Error("DB temporalmente no disponible"));
    const event = sessionEvent("checkout.session.completed");
    expect((await deliver(event)).status).toBe(500);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
    expect((await deliver(event)).status).toBe(200);
    expectOnePostPaymentFlow();
  });

  it("un fallo al guardar postpago revierte cobro, pedido y evento para recuperarlos juntos", async () => {
    seedPayment();
    mocks.enqueueStripePostPayment.mockRejectedValueOnce(new Error("No se pudo guardar el trabajo"));
    const event = sessionEvent("checkout.session.completed");
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expect(cart.status).toBe("ACCEPTED");
    expectNoPostPaymentEffects();
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expect(jobs.size).toBe(1);
    expect(mocks.processStripePostPayment).toHaveBeenCalledWith("pay_local_1");
  });

  it("una unique ajena al recibo no se confunde con un evento ya completado", async () => {
    seedPayment();
    mocks.enqueueStripePostPayment.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const event = sessionEvent("checkout.session.completed");
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("checkout y payment_intent reordenados comparten una sola confirmación", async () => {
    seedPayment({ stripePaymentIntentId: "pi_local_1" });
    await deliver(intentEvent("payment_intent.succeeded"));
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
    await deliver(sessionEvent("checkout.session.completed"));
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it("un PaymentIntent de hosted espera su sesión sin asociarse por metadata ni adelantar postpago", async () => {
    seedPayment({ stripeSessionId: null });
    const event = intentEvent("payment_intent.succeeded");
    Object.assign(event.data.object.metadata, { paymentId: "pay_local_1", source: "hosted-checkout" });
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].status).toBe("PENDING");
    expect(payments[0].stripePaymentIntentId).toBeNull();
    expectNoPostPaymentEffects();
  });

  it("un evento de otra integración sin metadata propia se ignora sin bloquear entregas", async () => {
    const event = intentEvent("payment_intent.succeeded");
    Object.assign(event.data.object, { metadata: {} });
    expect((await deliver(event)).status).toBe(200);
    expect(payments).toHaveLength(0);
    expectNoPostPaymentEffects();
  });

  it("la confirmación wallet anterior a su Payment local devuelve 500 y se recupera en reentrega", async () => {
    const event = intentEvent("payment_intent.succeeded");
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    seedPayment({ stripeSessionId: null, stripePaymentIntentId: "pi_local_1" });
    expect((await deliver(event)).status).toBe(200);
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });

  it.each([
    ["importe nominal", { amount: 12099 }],
    ["importe recibido", { amount_received: 12099 }],
    ["moneda", { currency: "usd" }],
  ])("un PaymentIntent con %s diferente devuelve 500 sin acreditar el pago", async (_label, patch) => {
    seedPayment({ stripeSessionId: null, stripePaymentIntentId: "pi_local_1" });
    const event = intentEvent("payment_intent.succeeded");
    Object.assign(event.data.object, patch);
    expect((await deliver(event)).status).toBe(500);
    expect(receipts.has(event.id)).toBe(false);
    expect(payments[0].status).toBe("PENDING");
    expectNoPostPaymentEffects();
  });

  it("un failure de wallet posterior al éxito no revierte PAID", async () => {
    seedPayment({ stripeSessionId: null, stripePaymentIntentId: "pi_local_1" });
    await deliver(intentEvent("payment_intent.succeeded"));
    await deliver(intentEvent("payment_intent.payment_failed"));
    expect(payments[0].status).toBe("PAID");
    expectOnePostPaymentFlow();
  });
});
