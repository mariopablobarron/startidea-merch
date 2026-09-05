import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  db: {} as Record<string, unknown>,
  email: vi.fn(), telegram: vi.fn(), webhook: vi.fn(), split: vi.fn(),
  midocean: vi.fn(), cifra: vi.fn(), makito: vi.fn(), invoice: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/resend", () => ({ sendEmail: mocks.email, RESEND_TO_INTERNAL: "team@example.test" }));
vi.mock("@/lib/telegram", () => ({ notifyTelegram: mocks.telegram, escapeTgHtml: (s: string) => s }));
vi.mock("@/lib/webhooks", () => ({ emitWebhook: mocks.webhook }));
vi.mock("@/lib/purchase-orders", () => ({ createPurchaseOrdersFromCart: mocks.split }));
vi.mock("@/lib/midocean-auto-order", () => ({ autoPlaceMidoceanOrder: mocks.midocean }));
vi.mock("@/lib/cifra-auto-order", () => ({ autoPlaceCifraOrder: mocks.cifra }));
vi.mock("@/lib/makito-auto-order", () => ({ autoPlaceMakitoOrder: mocks.makito }));
vi.mock("@/lib/facturascripts-sync", () => ({ syncPaymentToFacturaScripts: mocks.invoice }));
import { enqueueStripePostPayment, processStripePostPayment, retryStripePostPayments } from "./stripe-post-payment";

const args = {
  paymentId: "pay-1", cartId: "cart-1", amountCents: 12100, currency: "eur",
  customer: { email: "client@example.test", name: "Cliente Demo", company: null },
  via: "checkout" as const,
};
type Row = { key: string; value: any; updatedAt: Date };
let settings: Map<string, Row>;
let payment: { failureReason: string | null; status: string; amountCents: number; currency: string; cartId: string };
let cart: { internalNotes: string | null; acceptedTotalCents: number; depositPercent: number; paymentLinkToken: string; items: never[] };
let referral: any;
let totalEarned: number;
let entries: any[];
let user: any;
let redemption: any;
let coupon: any;
let unassigned: number;
let items: { id: string; cartId: string; quantity: number; variantSku: string; purchaseOrderId: string | null;
  markings: { id: string; colours: number; positionId: string }[] }[];
let failLocal: string | null;
let changedCalls: number;
const clone = <T>(value: T): T => structuredClone(value);
const receipt = (id = args.paymentId) => settings.get(`stripe_post_payment:${id}`)!.value;
const tx = () => mocks.db as unknown as Prisma.TransactionClient;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  delete process.env.FACTURASCRIPTS_SYNC_ENABLED;
  settings = new Map();
  payment = { failureReason: "Anotación previa", status: "PAID", amountCents: args.amountCents, currency: "EUR", cartId: args.cartId };
  cart = { internalNotes: "Nota comercial original", acceptedTotalCents: 10000, depositPercent: 100, paymentLinkToken: "link-1", items: [] };
  referral = null; totalEarned = 0; entries = []; user = null; redemption = null; coupon = null;
  unassigned = 0; failLocal = null; changedCalls = 0;
  items = [{ id: "item-1", cartId: args.cartId, quantity: 100, variantSku: "variant-original",
    purchaseOrderId: null, markings: [{ id: "mark-1", colours: 1, positionId: "front" }] }];
  Object.assign(mocks.db, {
    adminSetting: {
      upsert: vi.fn(async ({ where, create }: any) => {
        if (!settings.has(where.key)) settings.set(where.key, { ...clone(create), updatedAt: new Date() });
        return clone(settings.get(where.key));
      }),
      findUnique: vi.fn(async ({ where }: any) => clone(settings.get(where.key) ?? null)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        changedCalls++;
        const row = settings.get(where.key);
        if (!row || !same(row.value, where.value.equals)) return { count: 0 };
        settings.set(where.key, { key: where.key, value: clone(data.value), updatedAt: new Date() });
        return { count: 1 };
      }),
      findMany: vi.fn(async ({ where, take }: any) => Array.from(settings.values())
        .filter((row) => row.key.startsWith(where.key.startsWith) && where.OR.some((f: any) => row.value.status === f.value.equals))
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()).slice(0, take).map(({ key }) => ({ key }))),
    },
    payment: {
      findUnique: vi.fn(async () => clone(payment)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (where.failureReason !== payment.failureReason) return { count: 0 };
        payment = { ...payment, ...data }; return { count: 1 };
      }),
    },
    cartQuote: {
      findUnique: vi.fn(async () => clone(cart)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (where.internalNotes !== cart.internalNotes) return { count: 0 };
        cart = { ...cart, ...data }; return { count: 1 };
      }),
    },
    cartQuoteItem: {
      count: vi.fn(async () => unassigned),
      findMany: vi.fn(async ({ where }: { where: { cartId: string } }) => clone(items.filter((item) => item.cartId === where.cartId))),
    },
    referral: {
      findUnique: vi.fn(async () => clone(referral)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (referral?.status !== where.status) return { count: 0 };
        referral = { ...referral, ...data }; return { count: 1 };
      }),
    },
    affiliatePartner: { update: vi.fn(async ({ data }: any) => {
      if (failLocal === "referral") { failLocal = null; throw new Error("Transient DB error"); }
      totalEarned += data.totalEarnedCents.increment;
    }) },
    couponRedemption: { findUnique: vi.fn(async () => clone(redemption)) },
    coupon: { findUnique: vi.fn(async () => clone(coupon)) },
    affiliateLedgerEntry: {
      findMany: vi.fn(async () => clone(entries)),
      create: vi.fn(async ({ data }: any) => {
        entries.push(clone(data));
        if (failLocal === "coupon" && entries.length === 2) { failLocal = null; throw new Error("Second entry rejected"); }
        return clone(data);
      }),
    },
    customerUser: {
      upsert: vi.fn(async ({ create }: any) => {
        if (!user) user = { ...clone(create), active: true, id: "customer-1" };
        return clone(user);
      }),
      update: vi.fn(async ({ data }: any) => {
        user = { ...user, ...clone(data) };
        if (failLocal === "magicLink") { failLocal = null; throw new Error("Transient DB error"); }
      }),
    },
    $transaction: vi.fn(async (fn: any) => {
      const before = { settings: clone(settings), payment: clone(payment), cart: clone(cart), referral: clone(referral), totalEarned, entries: clone(entries), user: clone(user) };
      try { return await fn(mocks.db); }
      catch (e) {
        ({ settings, payment, cart, referral, totalEarned, entries, user } = before);
        throw e;
      }
    }),
  });
  mocks.email.mockResolvedValue({ ok: true, id: "email-1" });
  mocks.telegram.mockResolvedValue(true);
  mocks.webhook.mockResolvedValue(undefined);
  mocks.split.mockResolvedValue([]);
  mocks.midocean.mockResolvedValue({ ok: true, orderId: "mid-1" });
  mocks.cifra.mockResolvedValue({ skipped: true, reason: "Sin PO Cifra (no hay productos Cifra en este cart)" });
  mocks.makito.mockResolvedValue({ skipped: true, reason: "Sin PO Makito (no hay productos Makito en este cart)" });
  mocks.invoice.mockResolvedValue({ ok: true, fsInvoiceCode: "F1" });
});

async function enqueue() { await enqueueStripePostPayment(tx(), args); }
function partnerData() {
  referral = { id: "ref-1", status: "LEAD", partnerId: "partner-1", partner: { commissionPct: 5 } };
  redemption = { couponId: "coupon-1" };
  coupon = { id: "coupon-1", code: "DEMO", commissionPctOverride: null, creditPctOverride: null,
    affiliate: { id: "partner-1", active: true, commissionPct: 5, creditPct: 2 } };
}

describe("durable Stripe post-payment", () => {
  it("enqueues once in the caller transaction without external effects or resetting progress", async () => {
    await enqueue();
    receipt().steps.telegram.state = "DONE";
    await enqueue();
    expect(settings.size).toBe(2);
    expect(receipt().steps.telegram.state).toBe("DONE");
    expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.midocean).not.toHaveBeenCalled();
  });

  it("finishes each effect once and reuses the persisted magic link on duplicate delivery", async () => {
    partnerData(); await enqueue();
    expect((await processStripePostPayment(args.paymentId)).status).toBe("done");
    const link = receipt().portalLink;
    expect(link).toContain(user.magicLinkToken);
    expect((await processStripePostPayment(args.paymentId)).status).toBe("done");
    expect(receipt().portalLink).toBe(link);
    expect(totalEarned).toBe(500); expect(entries.map((entry) => entry.amountCents)).toEqual([500, 200]);
    expect(mocks.email).toHaveBeenCalledTimes(2);
    expect(mocks.email.mock.calls[1][0].html).toContain(link);
    expect(mocks.midocean).toHaveBeenCalledTimes(1); expect(mocks.webhook).toHaveBeenCalledTimes(1);
    expect(mocks.invoice).not.toHaveBeenCalled();
  });

  it("only the permanent first cart owner performs commission and ordering", async () => {
    partnerData(); await enqueue();
    await enqueueStripePostPayment(tx(), { ...args, paymentId: "pay-2" });
    expect(receipt("pay-2").cartOwner).toBe(false);
    expect((await processStripePostPayment("pay-2")).status).toBe("review_required");
    expect(payment.failureReason).toContain("Otro pago");
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.midocean).not.toHaveBeenCalled(); expect(totalEarned).toBe(0);
    await processStripePostPayment(args.paymentId);
    expect(totalEarned).toBe(500); expect(entries).toHaveLength(2);
    expect(mocks.split).toHaveBeenCalledTimes(1);
  });

  it("concurrent invocations cannot both claim the same job", async () => {
    await enqueue();
    const result = await Promise.all([processStripePostPayment(args.paymentId), processStripePostPayment(args.paymentId)]);
    expect(result.map((r) => r.status).sort()).toEqual(["busy", "done"]);
    expect(mocks.midocean).toHaveBeenCalledTimes(1); expect(mocks.email).toHaveBeenCalledTimes(2);
  });

  it("rolls back a failed referral increment and retries only that local step", async () => {
    partnerData(); failLocal = "referral"; await enqueue();
    expect((await processStripePostPayment(args.paymentId)).status).toBe("pending");
    expect(referral.status).toBe("LEAD"); expect(totalEarned).toBe(0);
    expect(receipt().steps.referral.state).toBe("PENDING");
    expect((await processStripePostPayment(args.paymentId)).status).toBe("done");
    expect(totalEarned).toBe(500); expect(mocks.midocean).toHaveBeenCalledTimes(1);
  });

  it("rolls back both coupon entries with their receipt on a partial local failure", async () => {
    partnerData(); failLocal = "coupon"; await enqueue();
    await processStripePostPayment(args.paymentId);
    expect(entries).toHaveLength(0); expect(receipt().steps.coupon.state).toBe("PENDING");
    await processStripePostPayment(args.paymentId);
    expect(entries).toHaveLength(2); expect(totalEarned).toBe(500);
  });

  it("does not email the client before the durable magic link succeeds", async () => {
    failLocal = "magicLink"; await enqueue(); await processStripePostPayment(args.paymentId);
    expect(receipt().steps.customerEmail.state).toBe("PENDING");
    expect(user).toBeNull(); expect(mocks.email).toHaveBeenCalledTimes(1);
    await processStripePostPayment(args.paymentId);
    expect(mocks.email).toHaveBeenCalledTimes(2);
    expect(mocks.email.mock.calls[1][0].html).toContain(receipt().portalLink);
  });

  it.each(["midocean", "telegram", "internalEmail", "customerEmail", "invoice"])("records unsuccessful %s as review, preserving notes and continuing independent work", async (step) => {
    process.env.FACTURASCRIPTS_SYNC_ENABLED = "true";
    if (step === "midocean") mocks.midocean.mockResolvedValue({ ok: false, error: "uncertain" });
    if (step === "telegram") mocks.telegram.mockResolvedValue(false);
    if (step === "internalEmail") mocks.email.mockResolvedValueOnce({ ok: false, error: "failed" });
    if (step === "customerEmail") mocks.email.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    if (step === "invoice") mocks.invoice.mockResolvedValue({ ok: false });
    await enqueue();
    expect((await processStripePostPayment(args.paymentId)).status).toBe("review_required");
    expect(receipt().steps[step].state).toBe("REVIEW_REQUIRED");
    expect(cart.internalNotes).toContain("Nota comercial original\n[Postpago pay-1]");
    expect(payment.failureReason).toContain("Anotación previa\n[Postpago pay-1]");
    expect(mocks.email).toHaveBeenCalledTimes(2);
    await processStripePostPayment(args.paymentId);
    expect(mocks.email).toHaveBeenCalledTimes(2);
  });

  it("an expired STARTED external step is never repeated after a process restart", async () => {
    await enqueue();
    receipt().status = "PROCESSING";
    receipt().lease = { token: "dead-worker", until: Date.now() - 1 };
    receipt().steps.midocean = { state: "STARTED" };
    expect((await processStripePostPayment(args.paymentId)).status).toBe("review_required");
    expect(mocks.midocean).not.toHaveBeenCalled();
    expect(receipt().steps.midocean.state).toBe("REVIEW_REQUIRED");
    expect(mocks.email).toHaveBeenCalledTimes(2);
  });

  it("a live lease is busy, not completed", async () => {
    await enqueue(); receipt().lease = { token: "live-worker", until: Date.now() + 60_000 };
    expect((await processStripePostPayment(args.paymentId)).status).toBe("busy");
    expect(changedCalls).toBe(0); expect(mocks.email).not.toHaveBeenCalled();
  });

  it("an old worker cannot overwrite the new owner or start remaining effects", async () => {
    await enqueue();
    mocks.midocean.mockImplementationOnce(async () => {
      receipt().lease = { token: "replacement-owner", until: Date.now() + 600_000 };
      receipt().steps.midocean = { state: "REVIEW_REQUIRED" };
      return { ok: true, orderId: "remote-order" };
    });
    expect((await processStripePostPayment(args.paymentId)).status).toBe("busy");
    expect(receipt().lease.token).toBe("replacement-owner");
    expect(receipt().steps.midocean.state).toBe("REVIEW_REQUIRED");
    expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.cifra).not.toHaveBeenCalled();
  });

  it("does not declare an occupied supplier lock or a dry run completed", async () => {
    mocks.midocean.mockResolvedValue({ skipped: true, reason: "Ya hay otro proceso cursando este pedido" });
    mocks.cifra.mockResolvedValue({ ok: true, dryRun: true, reason: "not live" });
    await enqueue(); await processStripePostPayment(args.paymentId);
    expect(receipt().steps.midocean.state).toBe("REVIEW_REQUIRED");
    expect(receipt().steps.cifra.state).toBe("REVIEW_REQUIRED");
  });

  it("a split busy/partial result stays pending and blocks supplier calls until all items are assigned", async () => {
    unassigned = 1; await enqueue(); await processStripePostPayment(args.paymentId);
    expect(receipt().steps.split.state).toBe("PENDING");
    expect(mocks.midocean).not.toHaveBeenCalled(); expect(mocks.email).toHaveBeenCalledTimes(2);
    unassigned = 0; await processStripePostPayment(args.paymentId);
    expect(mocks.midocean).toHaveBeenCalledTimes(1); expect(mocks.email).toHaveBeenCalledTimes(2);
  });

  it("recovers an interrupted local split, while completed magic links remain unchanged", async () => {
    await enqueue();
    receipt().steps.split = { state: "STARTED" };
    receipt().steps.magicLink = { state: "DONE" }; receipt().portalLink = "https://example.test/saved-link";
    await processStripePostPayment(args.paymentId);
    expect(mocks.split).toHaveBeenCalledTimes(1);
    expect(receipt().portalLink).toBe("https://example.test/saved-link");
    expect(user).toBeNull();
  });

  it("keeps the invoice gate off if disabled either at enqueue or at execution", async () => {
    await enqueue(); process.env.FACTURASCRIPTS_SYNC_ENABLED = "true";
    await processStripePostPayment(args.paymentId); expect(mocks.invoice).not.toHaveBeenCalled();
    await enqueueStripePostPayment(tx(), { ...args, paymentId: "pay-2" });
    delete process.env.FACTURASCRIPTS_SYNC_ENABLED;
    await processStripePostPayment("pay-2"); expect(mocks.invoice).not.toHaveBeenCalled();
  });

  it("filters terminal receipts before applying the bounded cron limit", async () => {
    for (let i = 0; i < 6; i++) {
      await enqueueStripePostPayment(tx(), { ...args, cartId: `old-cart-${i}`, paymentId: `old-${i}` });
      receipt(`old-${i}`).status = "DONE";
    }
    await enqueue();
    const result = await retryStripePostPayments(1);
    expect(result.checked).toBe(1);
    expect(result.results).toEqual([{ paymentId: args.paymentId, status: "done" }]);
    expect((mocks.db.adminSetting as any).findMany.mock.calls[0][0].where.OR).toHaveLength(2);
  });

  it("captures the commission base with the paid transaction", async () => {
    partnerData(); await enqueue();
    expect(receipt().affiliateBaseCents).toBe(10000);
    await processStripePostPayment(args.paymentId);
    expect(totalEarned).toBe(500); expect(entries.map((entry) => entry.amountCents)).toEqual([500, 200]);
  });

  it.each(["refund", "amount", "currency", "cart", "terms", "deposit", "link"])("contains all unstarted effects if %s changes while the job is queued", async (change) => {
    partnerData(); await enqueue();
    if (change === "refund") payment.status = "REFUNDED";
    if (change === "amount") payment.amountCents = 1;
    if (change === "currency") payment.currency = "USD";
    if (change === "cart") payment.cartId = "another-cart";
    if (change === "terms") cart.acceptedTotalCents = 25000;
    if (change === "deposit") cart.depositPercent = 50;
    if (change === "link") cart.paymentLinkToken = "changed-link";
    expect((await processStripePostPayment(args.paymentId)).status).toBe("review_required");
    expect(totalEarned).toBe(0); expect(entries).toHaveLength(0);
    expect(mocks.split).not.toHaveBeenCalled(); expect(mocks.midocean).not.toHaveBeenCalled(); expect(mocks.email).not.toHaveBeenCalled();
    expect(payment.status).toBe(change === "refund" ? "REFUNDED" : "PAID");
    expect(payment.failureReason).toContain("Revisión necesaria");
  });

  it("rechecks payment state between external steps, preserving completed receipts", async () => {
    await enqueue();
    mocks.midocean.mockImplementationOnce(async () => { payment.status = "REFUNDED"; return { ok: true, orderId: "mid-1" }; });
    expect((await processStripePostPayment(args.paymentId)).status).toBe("review_required");
    expect(receipt().steps.midocean.state).toBe("DONE");
    expect(receipt().steps.cifra.state).toBe("REVIEW_REQUIRED");
    expect(mocks.cifra).not.toHaveBeenCalled(); expect(mocks.email).not.toHaveBeenCalled();
  });

  it.each(["quantity", "variant", "marking"])("a %s change with the same price stops queued fulfilment", async (change) => {
    partnerData(); await enqueue();
    const originalFingerprint = receipt().quote.itemsFingerprint;
    if (change === "quantity") items[0].quantity++;
    if (change === "variant") items[0].variantSku = "variant-changed";
    if (change === "marking") items[0].markings[0].colours++;
    expect((await processStripePostPayment(args.paymentId)).status).toBe("review_required");
    expect(cart.acceptedTotalCents).toBe(10_000); expect(payment.amountCents).toBe(12_100);
    expect(receipt().quote.itemsFingerprint).toBe(originalFingerprint);
    expect(totalEarned).toBe(0); expect(entries).toHaveLength(0);
    expect(mocks.split).not.toHaveBeenCalled(); expect(mocks.midocean).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled(); expect(payment.failureReason).toContain("Revisión necesaria");
  });

  it("purchaseOrderId assignment during split preserves the quote fingerprint and fulfilment", async () => {
    await enqueue();
    const originalFingerprint = receipt().quote.itemsFingerprint;
    mocks.split.mockImplementationOnce(async () => {
      items[0].purchaseOrderId = "po-assigned";
      return [{ id: "po-assigned" }];
    });
    expect((await processStripePostPayment(args.paymentId)).status).toBe("done");
    expect(receipt().quote.itemsFingerprint).toBe(originalFingerprint);
    expect(mocks.midocean).toHaveBeenCalledTimes(1); expect(mocks.email).toHaveBeenCalledTimes(2);
  });

  it("keeps manually fulfilled supplier orders visible even when their adapter says notified", async () => {
    mocks.makito.mockResolvedValue({ ok: true, notified: true, poId: "po-1" });
    await enqueue(); await processStripePostPayment(args.paymentId);
    expect(receipt().steps.makito.state).toBe("REVIEW_REQUIRED");
    expect(cart.internalNotes).toContain("Makito");
  });

  it("does not backfill or execute jobs for unknown historic paid rows", async () => {
    expect(await processStripePostPayment("unknown")).toEqual({ paymentId: "unknown", status: "missing" });
    expect(mocks.email).not.toHaveBeenCalled();
  });
});
