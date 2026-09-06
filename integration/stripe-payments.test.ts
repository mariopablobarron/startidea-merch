import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { readPaymentItemsFingerprint } from "../src/lib/payment-quote-fingerprint";
import type { PaymentAttemptSnapshot } from "../src/lib/payment-attempts";
import { prisma } from "../src/lib/prisma";
import { POST } from "../src/app/api/webhooks/stripe/route";
import { processStripePostPayment } from "../src/lib/stripe-post-payment";
import { startPaymentAttempt } from "../src/lib/payment-attempts";

const externals = vi.hoisted(() => ({ mail: vi.fn(), telegram: vi.fn(), supplier: vi.fn(), webhook: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), after: externals.after }));
vi.mock("../src/lib/stripe", () => ({ stripe: new Stripe("sk_test_local_only_not_a_credential"), STRIPE_WEBHOOK_SECRET: "whsec_local_only", STRIPE_MODE: "test" }));
vi.mock("../src/lib/resend", () => ({ sendEmail: externals.mail, RESEND_TO_INTERNAL: "internal@example.invalid" }));
vi.mock("../src/lib/telegram", () => ({ notifyTelegram: externals.telegram, escapeTgHtml: (s: string) => s }));
vi.mock("../src/lib/webhooks", () => ({ emitWebhook: externals.webhook }));
vi.mock("../src/lib/midocean-auto-order", () => ({ autoPlaceMidoceanOrder: externals.supplier }));
vi.mock("../src/lib/cifra-auto-order", () => ({ autoPlaceCifraOrder: externals.supplier }));
vi.mock("../src/lib/makito-auto-order", () => ({ autoPlaceMakitoOrder: externals.supplier }));
vi.mock("../src/lib/purchase-orders", () => ({ createPurchaseOrdersFromCart: vi.fn(async () => []) }));
vi.mock("../src/lib/facturascripts-sync", () => ({ syncPaymentToFacturaScripts: vi.fn(() => { throw new Error("Invoices must remain disabled"); }) }));

const signer = new Stripe("sk_test_local_only_not_a_credential");
let seq = 0;
async function fixture() {
  const n = ++seq;
  const cart = await prisma.cartQuote.create({ data: {
    name: "Cliente de prueba local", email: `test-${n}@example.invalid`, status: "SENT",
    acceptedTotalCents: 10000, depositPercent: 100, paymentLinkToken: `local-token-${n}`,
  } });
  const payment = await prisma.payment.create({ data: {
    cartId: cart.id, amountCents: 12100, currency: "EUR", kind: "FULL", stripeMode: "test", stripeSessionId: `cs_local_${n}`,
  } });
  await snapshot(cart, payment);
  return { cart, payment, n };
}
async function snapshot(cart: { id: string; acceptedTotalCents: number | null; depositPercent: number | null; paymentLinkToken: string | null }, payment: { id: string; amountCents: number }) {
  await prisma.adminSetting.create({ data: { key: `payment_attempt:${payment.id}`, value: {
    version: 1, paymentId: payment.id, cartId: cart.id, mode: "test", channel: "hosted", createdAt: new Date().toISOString(), params: {},
    quote: { acceptedTotalCents: cart.acceptedTotalCents, depositPercent: cart.depositPercent, paymentLinkToken: cart.paymentLinkToken,
      amountCents: payment.amountCents, currency: "eur", kind: "FULL", taxEnabled: false,
      itemsFingerprint: await readPaymentItemsFingerprint(prisma, cart.id) },
  } } });
}
function sessionEvent(f: Awaited<ReturnType<typeof fixture>>, suffix: string, paymentStatus = "paid") {
  return { id: `evt_local_${f.n}_${suffix}`, object: "event", created: Math.floor(Date.now() / 1000), livemode: false,
    type: "checkout.session.completed", data: { object: {
      object: "checkout.session", id: f.payment.stripeSessionId, payment_intent: `pi_local_${f.n}`,
      payment_status: paymentStatus, currency: "eur", amount_total: 12100, amount_subtotal: 12100,
      metadata: { cartId: f.cart.id, paymentId: f.payment.id },
    } },
  };
}
async function deliver(event: unknown) {
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_local_only" });
  return POST(new Request("http://127.0.0.1/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
}
async function receipt(paymentId: string) {
  return prisma.adminSetting.findUnique({ where: { key: `stripe_post_payment:${paymentId}` } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  externals.mail.mockResolvedValue({ ok: true });
  externals.telegram.mockResolvedValue(true);
  externals.supplier.mockResolvedValue({ skipped: true, reason: "no hay productos" });
  externals.webhook.mockResolvedValue(undefined);
  // Guard is loaded before this module; only this disposable DB is writable.
  const db = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  expect(db[0].name).toBe("merch_cto_payments_test");
  await prisma.adminSetting.deleteMany();
  await prisma.processedStripeEvent.deleteMany();
  await prisma.cartQuote.deleteMany();
  await prisma.customerUser.deleteMany();
});
afterAll(async () => { await prisma.$disconnect(); });

describe("Stripe + PostgreSQL local real, sin transporte externo", () => {
  it("verifica firma SDK real antes de consultar datos", async () => {
    const response = await POST(new Request("http://127.0.0.1/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "incorrecta" } }));
    expect(response.status).toBe(400);
    expect(await prisma.processedStripeEvent.count()).toBe(0);
  });

  it("completed impagado no confirma; liquidación posterior crea un solo trabajo", async () => {
    const f = await fixture();
    expect((await deliver(sessionEvent(f, "unpaid", "unpaid"))).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("PENDING");
    expect(await receipt(f.payment.id)).toBeNull();
    const paid = { ...sessionEvent(f, "paid"), type: "checkout.session.async_payment_succeeded" };
    expect((await deliver(paid)).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("PAID");
    expect(await receipt(f.payment.id)).not.toBeNull();
    expect(externals.mail).not.toHaveBeenCalled();
  });

  it("deduplica entregas simultáneas con restricciones reales de PostgreSQL", async () => {
    const f = await fixture();
    const results = await Promise.all([deliver(sessionEvent(f, "same")), deliver(sessionEvent(f, "same")), deliver(sessionEvent(f, "other"))]);
    expect(results.map(r => r.status)).toEqual([200, 200, 200]);
    expect(await prisma.processedStripeEvent.count()).toBe(2);
    expect(await prisma.adminSetting.count({ where: { key: { startsWith: "stripe_post_payment:" } } })).toBe(1);
    expect(externals.after).toHaveBeenCalledTimes(1);
  });

  it("revierte Payment y recibo ante un fallo SQL, y recupera la misma entrega", async () => {
    const f = await fixture();
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION cto_reject_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'CONFIRMED' THEN RAISE EXCEPTION 'injected local failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER cto_failure BEFORE UPDATE ON "CartQuote" FOR EACH ROW EXECUTE FUNCTION cto_reject_confirmation()`);
    try {
      expect((await deliver(sessionEvent(f, "retry"))).status).toBe(500);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("PENDING");
      expect(await prisma.processedStripeEvent.count()).toBe(0);
      expect(await receipt(f.payment.id)).toBeNull();
    } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER cto_failure ON "CartQuote"`); }
    expect((await deliver(sessionEvent(f, "retry"))).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("PAID");
  });

  it("dos pagos del mismo carrito registran fondos sin duplicar su ejecución", async () => {
    const f = await fixture();
    const second = await prisma.payment.create({ data: { cartId: f.cart.id, amountCents: 12100, currency: "EUR", kind: "FULL", stripeMode: "test", stripeSessionId: `cs_second_${f.n}` } });
    await snapshot(f.cart, second);
    const other = sessionEvent({ ...f, payment: second }, "second");
    other.data.object.payment_intent = `pi_second_${f.n}`;
    const responses = await Promise.all([deliver(sessionEvent(f, "first")), deliver(other)]);
    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(await prisma.payment.count({ where: { cartId: f.cart.id, status: "PAID" } })).toBe(2);
    expect(await prisma.adminSetting.count({ where: { key: { startsWith: "stripe_post_payment:" } } })).toBe(1);
    expect((await prisma.cartQuote.findUniqueOrThrow({ where: { id: f.cart.id } })).internalNotes).toContain("Pago confirmado adicional");
  });

  it("un segundo cobro tras reembolso no finge que el primer pedido ya se ejecutó", async () => {
    const f = await fixture();
    await deliver(sessionEvent(f, "first-owner"));
    await deliver({ id: `evt_refund_owner_${f.n}`, type: "charge.refunded", livemode: false, data: { object: {
      id: `ch_owner_${f.n}`, refunded: true, payment_intent: `pi_local_${f.n}`, metadata: { cartId: f.cart.id, paymentId: f.payment.id },
    } } });
    const second = await prisma.payment.create({ data: { cartId: f.cart.id, amountCents: 12100, currency: "EUR", kind: "FULL", stripeMode: "test", stripeSessionId: `cs_owner_second_${f.n}` } });
    await snapshot(f.cart, second);
    const event = sessionEvent({ ...f, payment: second }, "after-refund"); event.data.object.payment_intent = `pi_owner_second_${f.n}`;
    expect((await deliver(event)).status).toBe(200);
    expect(await receipt(second.id)).toBeNull();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: second.id } })).failureReason).toContain("Pago confirmado adicional");
    expect(externals.mail).not.toHaveBeenCalled(); expect(externals.supplier).not.toHaveBeenCalled();
    expect((await prisma.adminSetting.findUniqueOrThrow({ where: { key: `stripe_post_payment_cart:${f.cart.id}` } })).value).toEqual({ paymentId: f.payment.id });
  });

  it("recupera outbox tras ACK sin repetir efectos por dos trabajadores", async () => {
    const f = await fixture();
    await deliver(sessionEvent(f, "outbox"));
    expect(externals.mail).not.toHaveBeenCalled();
    await Promise.all([processStripePostPayment(f.payment.id), processStripePostPayment(f.payment.id)]);
    expect(externals.mail).toHaveBeenCalledTimes(2);
    expect(externals.telegram).toHaveBeenCalledTimes(1);
    await processStripePostPayment(f.payment.id);
    expect(externals.mail).toHaveBeenCalledTimes(2);
    expect((await receipt(f.payment.id))?.value).toMatchObject({ status: "DONE" });
  });

  it("un efecto externo iniciado antes de caída queda en revisión y no se repite", async () => {
    const f = await fixture();
    await deliver(sessionEvent(f, "uncertain"));
    const row = await receipt(f.payment.id);
    const value = structuredClone(row!.value) as Record<string, any>;
    value.status = "PROCESSING";
    value.lease = { token: "old-worker", until: Date.now() - 10000 };
    value.steps.midocean = { state: "STARTED" };
    await prisma.adminSetting.update({ where: { key: row!.key }, data: { value } });
    expect((await processStripePostPayment(f.payment.id)).status).toBe("review_required");
    expect(externals.supplier).toHaveBeenCalledTimes(2);
    expect((await prisma.cartQuote.findUniqueOrThrow({ where: { id: f.cart.id } })).internalNotes).toContain("Revisión necesaria");
  });

  it("un cambio de cantidad con el mismo precio impide cursar una versión diferente", async () => {
    const f = await fixture();
    const item = await prisma.cartQuoteItem.create({ data: { cartId: f.cart.id, productSlug: "local", productRef: "LOCAL", productName: "Local", quantity: 100 } });
    await prisma.adminSetting.delete({ where: { key: `payment_attempt:${f.payment.id}` } });
    await snapshot(f.cart, f.payment);
    await prisma.cartQuoteItem.update({ where: { id: item.id }, data: { quantity: 1000 } });
    expect((await deliver(sessionEvent(f, "changed-items"))).status).toBe(200);
    expect(await receipt(f.payment.id)).toBeNull();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).failureReason).toContain("versión anterior");
  });

  it("la recuperación contiene todos los pasos si cambian líneas después del cobro", async () => {
    const f = await fixture();
    await deliver(sessionEvent(f, "queued-items"));
    await prisma.cartQuoteItem.create({ data: { cartId: f.cart.id, productSlug: "new", productRef: "NEW", productName: "Nueva línea", quantity: 1000 } });
    expect(await processStripePostPayment(f.payment.id)).toMatchObject({ status: "review_required" });
    expect(externals.mail).not.toHaveBeenCalled(); expect(externals.supplier).not.toHaveBeenCalled();
  });

  it("un intento histórico sin versión acreditada registra el cobro para revisión", async () => {
    const f = await fixture();
    await prisma.adminSetting.delete({ where: { key: `payment_attempt:${f.payment.id}` } });
    expect((await deliver(sessionEvent(f, "legacy"))).status).toBe(200);
    expect(await receipt(f.payment.id)).toBeNull();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("PAID");
  });

  it("wallet concurrente reserva una sola obligación y conserva la correspondencia", async () => {
    const f = await fixture();
    await prisma.payment.delete({ where: { id: f.payment.id } });
    const objects = new Map<string, Stripe.PaymentIntent>();
    const create = vi.fn(async (snapshot: PaymentAttemptSnapshot) => {
      await new Promise(resolve => setTimeout(resolve, 20));
      const object = { object: "payment_intent", id: `pi_reserved_${snapshot.paymentId}`, livemode: false, currency: "eur", amount: 12100, status: "requires_payment_method", metadata: snapshot.params.metadata, client_secret: "local-client-secret" } as Stripe.PaymentIntent;
      objects.set(object.id, object); return object;
    });
    const provider = { paymentIntents: { retrieve: vi.fn(async (id: string) => objects.get(id)) } } as unknown as Stripe;
    const input = { stripe: provider, cart: f.cart, mode: "test" as const, channel: "wallet" as const,
      quote: { acceptedTotalCents: 10000, depositPercent: 100, paymentLinkToken: f.cart.paymentLinkToken!, amountCents: 12100, currency: "eur" as const, kind: "FULL" as const, taxEnabled: false },
      params: { amount: 12100, currency: "eur" }, create,
    };
    const results = await Promise.allSettled([startPaymentAttempt(input), startPaymentAttempt(input)]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    const again = await startPaymentAttempt(input);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await prisma.payment.count({ where: { cartId: f.cart.id } })).toBe(1);
    expect((await prisma.payment.findFirstOrThrow({ where: { cartId: f.cart.id } })).stripePaymentIntentId).toBe(again.id);
  });
});
