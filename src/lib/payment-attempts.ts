import { Prisma, type Payment } from "@prisma/client";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { acquireCronLockLease, releaseCronLockLease } from "@/lib/cron-lock";
import { readPaymentItemsFingerprint } from "@/lib/payment-quote-fingerprint";

export type PaymentChannel = "wallet" | "hosted";
export const paymentAttemptKey = (paymentId: string) => `payment_attempt:${paymentId}`;
export const paymentAttemptActiveKey = (mode: string, cartId: string) =>
  `payment_attempt_active:${mode}:${cartId}`;

const quoteSchema = z.object({
  acceptedTotalCents: z.number().int().positive(),
  depositPercent: z.number().int().min(1).max(100),
  paymentLinkToken: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal("eur"),
  kind: z.enum(["FULL", "DEPOSIT"]),
  taxEnabled: z.boolean(),
  itemsFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
const snapshotSchema = z.object({
  version: z.literal(1),
  paymentId: z.string().min(1),
  cartId: z.string().min(1),
  mode: z.enum(["test", "live"]),
  channel: z.enum(["wallet", "hosted"]),
  createdAt: z.string().datetime(),
  quote: quoteSchema,
  params: z.record(z.string(), z.unknown()),
  legacy: z.boolean().optional(),
});
export type PaymentAttemptSnapshot = z.infer<typeof snapshotSchema>;
type Quote = PaymentAttemptSnapshot["quote"];
type StripeObject = Stripe.PaymentIntent | Stripe.Checkout.Session;
type Cart = {
  id: string;
  acceptedTotalCents: number | null;
  depositPercent: number | null;
  paymentLinkToken: string | null;
};
type StartInput = {
  stripe: Stripe;
  cart: Cart;
  mode: "test" | "live";
  channel: PaymentChannel;
  quote: Quote;
  params: Stripe.PaymentIntentCreateParams | Stripe.Checkout.SessionCreateParams;
  create: (snapshot: PaymentAttemptSnapshot, options: Stripe.RequestOptions) => Promise<StripeObject>;
};

export class PaymentAttemptError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PaymentAttemptError";
  }
}

const review = () => new PaymentAttemptError(409, "Hay un intento de pago que necesita revisión. No se ha abierto otro cobro.");
const busy = () => new PaymentAttemptError(409, "Hay un pago en preparación o confirmación. Espera unos segundos y vuelve a intentarlo.");
const STRIPE_OPTIONS: Stripe.RequestOptions = { timeout: 10_000, maxNetworkRetries: 1 };
// Stripe puede eliminar una clave después de 24 h. Un intento sin ID entonces
// es ambiguo: no volver a crearlo, aunque conserve su clave original.
const MAX_UNBOUND_AGE_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 3 * 60 * 1000;

export function parsePaymentAttemptSnapshot(value: unknown): PaymentAttemptSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function readPaymentAttemptSnapshot(paymentId: string): Promise<PaymentAttemptSnapshot | null> {
  const row = await prisma.adminSetting.findUnique({ where: { key: paymentAttemptKey(paymentId) } });
  return parsePaymentAttemptSnapshot(row?.value);
}

function metadata(snapshot: Pick<PaymentAttemptSnapshot, "paymentId" | "cartId" | "channel" | "quote">) {
  return {
    paymentId: snapshot.paymentId,
    cartId: snapshot.cartId,
    source: snapshot.channel === "wallet" ? "express-checkout" : "hosted-checkout",
    kind: snapshot.quote.kind,
    paymentLinkToken: snapshot.quote.paymentLinkToken,
    depositPercent: String(snapshot.quote.depositPercent),
    acceptedTotalCents: String(snapshot.quote.acceptedTotalCents),
    expectedAmountCents: String(snapshot.quote.amountCents),
    taxEnabled: String(snapshot.quote.taxEnabled),
  };
}

function makeSnapshot(input: StartInput, payment: Payment, channel = input.channel, legacy = false): PaymentAttemptSnapshot {
  const snapshot: PaymentAttemptSnapshot = {
    version: 1, paymentId: payment.id, cartId: payment.cartId,
    mode: input.mode, channel, createdAt: payment.createdAt.toISOString(),
    quote: { ...input.quote, amountCents: payment.amountCents, kind: payment.kind === "FULL" ? "FULL" : "DEPOSIT" },
    params: {}, ...(legacy ? { legacy: true } : {}),
  };
  const meta = metadata(snapshot);
  const params = { ...input.params, metadata: meta };
  snapshot.params = JSON.parse(JSON.stringify(channel === "hosted"
    ? { ...params, payment_intent_data: { metadata: meta } }
    : params));
  return snapshot;
}

async function ensureCurrentCart(tx: Prisma.TransactionClient, input: StartInput, fingerprint?: string) {
  const current = await tx.cartQuote.findUnique({
    where: { id: input.cart.id },
    include: { payments: { where: { status: "PAID" }, select: { id: true } } },
  });
  if (!current || current.paymentLinkToken !== input.quote.paymentLinkToken) throw review();
  if (current.payments.length) throw new PaymentAttemptError(409, "Cotización ya pagada");
  if (current.paymentLinkExpiresAt && current.paymentLinkExpiresAt < new Date()) {
    throw new PaymentAttemptError(410, "Este enlace de pago ha caducado. Contáctanos para renovar tu cotización.");
  }
  if (current.acceptedTotalCents !== input.quote.acceptedTotalCents || current.depositPercent !== input.quote.depositPercent) {
    throw new PaymentAttemptError(409, "El importe de la cotización ha cambiado. Recarga la página antes de pagar.");
  }
  if (fingerprint && await readPaymentItemsFingerprint(tx, input.cart.id) !== fingerprint) throw review();
}

async function reserve(input: StartInput): Promise<{ payment: Payment; snapshot: PaymentAttemptSnapshot }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment-attempt:${input.mode}:${input.cart.id}`}))`;
    await ensureCurrentCart(tx, input);
    const activeKey = paymentAttemptActiveKey(input.mode, input.cart.id);
    const active = await tx.adminSetting.findUnique({ where: { key: activeKey } });
    const activeId = active?.value && typeof active.value === "object" && !Array.isArray(active.value)
      ? active.value.paymentId : null;
    if (active && typeof activeId !== "string") throw review();
    if (typeof activeId === "string") {
      const payment = await tx.payment.findUnique({ where: { id: activeId } });
      const row = await tx.adminSetting.findUnique({ where: { key: paymentAttemptKey(activeId) } });
      const snapshot = parsePaymentAttemptSnapshot(row?.value);
      if (!payment || !snapshot || payment.cartId !== input.cart.id || snapshot.cartId !== input.cart.id ||
        snapshot.paymentId !== payment.id || snapshot.mode !== input.mode || payment.stripeMode !== input.mode) throw review();
      return { payment, snapshot };
    }

    // Adoptar una correspondencia antigua conocida. Varias pendientes o una
    // fila sin identificador no permiten elegir cuál representa el cobro.
    const prior = await tx.payment.findMany({
      where: { cartId: input.cart.id, status: { in: ["PENDING", "FAILED"] },
        OR: [{ stripeMode: input.mode }, { stripeMode: null }] },
      orderBy: { createdAt: "desc" }, take: 2,
    });
    if (prior.length > 1) throw review();
    let payment = prior[0];
    let snapshot: PaymentAttemptSnapshot;
    if (payment) {
      if ((!payment.stripeSessionId && !payment.stripePaymentIntentId) || payment.stripeMode !== input.mode ||
        !["FULL", "DEPOSIT"].includes(payment.kind)) throw review();
      snapshot = makeSnapshot(input, payment, payment.stripeSessionId ? "hosted" : "wallet", true);
    } else {
      payment = await tx.payment.create({ data: {
        cartId: input.cart.id, amountCents: input.quote.amountCents, currency: "EUR", status: "PENDING",
        kind: input.quote.kind, stripeMode: input.mode,
      } });
      snapshot = makeSnapshot(input, payment);
      snapshot.quote.itemsFingerprint = await readPaymentItemsFingerprint(tx, input.cart.id);
    }
    await tx.adminSetting.create({ data: { key: paymentAttemptKey(payment.id), value: snapshot as Prisma.InputJsonValue } });
    await tx.adminSetting.create({ data: { key: activeKey, value: { paymentId: payment.id } } });
    return { payment, snapshot };
  });
}

async function assertOwnership(lockKey: string, owner: string) {
  const lock = await prisma.adminSetting.findUnique({ where: { key: `cron_lock:${lockKey}` } });
  if (!lock?.value || typeof lock.value !== "object" || Array.isArray(lock.value) || lock.value.token !== owner) throw busy();
}

function verifyObject(object: StripeObject, payment: Payment, snapshot: PaymentAttemptSnapshot) {
  const isIntent = object.object === "payment_intent";
  if ((snapshot.channel === "wallet") !== isIntent || object.livemode !== (snapshot.mode === "live") ||
      object.currency?.toLowerCase() !== payment.currency.toLowerCase()) throw review();
  const amount = isIntent ? object.amount : object.amount_subtotal;
  if (amount !== snapshot.quote.amountCents || payment.amountCents !== snapshot.quote.amountCents) throw review();
  if (object.metadata?.cartId !== payment.cartId) throw review();
  if (!snapshot.legacy && Object.entries(metadata(snapshot)).some(([key, value]) => object.metadata?.[key] !== value)) throw review();
}

async function getObject(input: StartInput, payment: Payment, snapshot: PaymentAttemptSnapshot, lockKey: string, owner: string) {
  await assertOwnership(lockKey, owner);
  let object: StripeObject;
  if (snapshot.channel === "hosted" && payment.stripeSessionId) {
    object = await input.stripe.checkout.sessions.retrieve(payment.stripeSessionId, {}, STRIPE_OPTIONS);
  } else if (snapshot.channel === "wallet" && payment.stripePaymentIntentId) {
    object = await input.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {}, STRIPE_OPTIONS);
  } else {
    if (snapshot.legacy || snapshot.channel !== input.channel || Date.now() - Date.parse(snapshot.createdAt) >= MAX_UNBOUND_AGE_MS) throw review();
    object = await input.create(snapshot, {
      ...STRIPE_OPTIONS, idempotencyKey: `merch:${snapshot.mode}:${payment.id}:${snapshot.channel}`,
    });
    verifyObject(object, payment, snapshot);
    // El webhook puede haber asociado el mismo objeto mientras respondía
    // Stripe. En ese caso el enlace ya es válido; otro ID nunca se pisa.
    const field = snapshot.channel === "wallet" ? "stripePaymentIntentId" : "stripeSessionId";
    const linked = await prisma.payment.updateMany({
      where: { id: payment.id, cartId: payment.cartId, OR: [{ [field]: null }, { [field]: object.id }] },
      data: { [field]: object.id },
    });
    if (linked.count !== 1) throw review();
  }
  verifyObject(object, payment, snapshot);
  return object;
}

function sameQuote(a: Quote, b: Quote) {
  return a.acceptedTotalCents === b.acceptedTotalCents && a.depositPercent === b.depositPercent &&
    a.paymentLinkToken === b.paymentLinkToken && a.amountCents === b.amountCents && a.kind === b.kind &&
    a.currency === b.currency && a.taxEnabled === b.taxEnabled;
}

async function retire(input: StartInput, payment: Payment, snapshot: PaymentAttemptSnapshot, object: StripeObject,
  lockKey: string, owner: string) {
  await assertOwnership(lockKey, owner);
  if (object.object === "payment_intent") {
    if (object.status !== "canceled") {
      if (!["requires_payment_method", "requires_confirmation"].includes(object.status)) throw busy();
      const canceled = await input.stripe.paymentIntents.cancel(object.id, {}, {
        ...STRIPE_OPTIONS, idempotencyKey: `merch:${snapshot.mode}:${payment.id}:cancel`,
      });
      if (canceled.status !== "canceled") throw busy();
    }
  } else if (object.status !== "expired") {
    // Un montaje automático de wallet no debe invalidar el checkout que ya
    // se está usando. El botón hosted recuperará su sesión abierta.
    if (input.channel === "wallet" || object.status !== "open") throw busy();
    const expired = await input.stripe.checkout.sessions.expire(object.id, {}, {
      ...STRIPE_OPTIONS, idempotencyKey: `merch:${snapshot.mode}:${payment.id}:expire`,
    });
    if (expired.status !== "expired") throw busy();
  }
  await assertOwnership(lockKey, owner);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payment-attempt:${input.mode}:${input.cart.id}`}))`;
    const changed = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ["PENDING", "FAILED", "CANCELED"] } },
      data: { status: "CANCELED", failureReason: "Intento sustituido después de confirmar su cancelación en Stripe" },
    });
    if (changed.count !== 1) throw busy();
    const removed = await tx.adminSetting.deleteMany({
      where: { key: paymentAttemptActiveKey(input.mode, input.cart.id), value: { equals: { paymentId: payment.id } } },
    });
    if (removed.count !== 1) throw busy();
  });
}

/** Un Payment por objeto Stripe, con reserva durable anterior a la llamada. */
export async function startPaymentAttempt(input: StartInput): Promise<StripeObject> {
  if (!quoteSchema.safeParse(input.quote).success) throw review();
  const lockKey = `payment-start:${input.mode}:${input.cart.id}`;
  const owner = await acquireCronLockLease(lockKey, LEASE_MS);
  if (!owner) throw busy();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { payment, snapshot } = await reserve(input);
      if (payment.status === "PAID" || payment.status === "REFUNDED") throw busy();
      const object = await getObject(input, payment, snapshot, lockKey, owner);
      const terminal = payment.status === "CANCELED" ||
        (object.object === "payment_intent" ? object.status === "canceled" : object.status === "expired");
      const compatible = !snapshot.legacy && snapshot.channel === input.channel && sameQuote(snapshot.quote, input.quote) &&
        !!snapshot.quote.itemsFingerprint && snapshot.quote.itemsFingerprint === await readPaymentItemsFingerprint(prisma, input.cart.id);
      if (compatible && !terminal) {
        const usable = object.object === "payment_intent"
          ? ["requires_payment_method", "requires_confirmation", "requires_action"].includes(object.status)
          : object.status === "open" && object.payment_status === "unpaid";
        if (!usable) throw busy();
        await assertOwnership(lockKey, owner);
        await ensureCurrentCart(prisma, input, snapshot.quote.itemsFingerprint);
        return object;
      }
      await retire(input, payment, snapshot, object, lockKey, owner);
    }
    throw busy();
  } finally {
    await releaseCronLockLease(lockKey, owner);
  }
}
