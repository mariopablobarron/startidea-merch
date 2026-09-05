import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, RESEND_TO_INTERNAL } from "@/lib/resend";
import { emitWebhook } from "@/lib/webhooks";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { autoPlaceMidoceanOrder } from "@/lib/midocean-auto-order";
import { autoPlaceCifraOrder } from "@/lib/cifra-auto-order";
import { autoPlaceMakitoOrder } from "@/lib/makito-auto-order";
import { createPurchaseOrdersFromCart } from "@/lib/purchase-orders";
import { syncPaymentToFacturaScripts } from "@/lib/facturascripts-sync";
import { IVA_RATE } from "@/lib/iva";
import { internalPaymentEmailHtml, clientPaidEmailHtml } from "@/lib/stripe-paid-emails";
import { readPaymentItemsFingerprint } from "@/lib/payment-quote-fingerprint";

type PaymentArgs = {
  cartId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  customer: { name: string; email: string; company: string | null };
  receiptUrl?: string;
  via: "checkout" | "express-checkout";
};
type StepState = "PENDING" | "STARTED" | "DONE" | "REVIEW_REQUIRED";
const STEPS = ["referral", "coupon", "split", "midocean", "cifra", "makito", "magicLink", "telegram", "webhook", "internalEmail", "customerEmail", "invoice"] as const;
type Step = typeof STEPS[number];
type Job = {
  version: 1;
  status: "PENDING" | "PROCESSING" | "DONE" | "REVIEW_REQUIRED";
  args: PaymentArgs;
  cartOwner: boolean;
  invoiceEnabled: boolean;
  affiliateBaseCents: number;
  quote: { acceptedTotalCents: number | null; depositPercent: number | null; paymentLinkToken: string | null; itemsFingerprint: string };
  createdAt: string;
  lease: { token: string; until: number } | null;
  steps: Record<Step, { state: StepState; reason?: string }>;
  portalLink?: string | null;
};
const PREFIX = "stripe_post_payment:";
const LEASE_MS = 10 * 60_000;
const CART_STEPS: Step[] = ["referral", "coupon", "split", "midocean", "cifra", "makito"];
const LOCAL_STEPS: Step[] = ["referral", "coupon", "magicLink"];
const LABEL: Record<Step, string> = {
  referral: "comisión de referido", coupon: "saldo de afiliado", split: "reparto del pedido",
  midocean: "MidOcean", cifra: "Cifra", makito: "Makito", magicLink: "acceso del cliente",
  telegram: "aviso interno", webhook: "integración externa", internalEmail: "correo interno",
  customerEmail: "correo del cliente", invoice: "factura",
};
const json = (job: Job) => JSON.parse(JSON.stringify(job)) as Prisma.InputJsonValue;

function decode(value: Prisma.JsonValue): Job {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 || !value.args || !value.steps) {
    throw new Error("Invalid post-payment receipt");
  }
  return value as unknown as Job;
}
class LeaseLost extends Error {}
class LocalPending extends Error {}
class ReviewRequired extends Error {}

/** Must share the transaction which confirms Payment, Cart and Stripe event.
 * The permanent cart owner also covers two distinct Payment rows for one cart.
 * No network operations occur here.
 */
export async function enqueueStripePostPayment(tx: Prisma.TransactionClient, args: PaymentArgs): Promise<void> {
  const owner = await tx.adminSetting.upsert({
    where: { key: `stripe_post_payment_cart:${args.cartId}` },
    create: { key: `stripe_post_payment_cart:${args.cartId}`, value: { paymentId: args.paymentId } },
    update: {},
  });
  const cartOwner = (owner.value as { paymentId?: string }).paymentId === args.paymentId;
  const steps = Object.fromEntries(STEPS.map((step) => [step, {
    state: !cartOwner ? "REVIEW_REQUIRED" : "PENDING",
    ...(!cartOwner ? { reason: "Otro pago es propietario de la ejecución; conciliar antes de continuar" } : {}),
  }])) as Job["steps"];
  const cart = await tx.cartQuote.findUnique({ where: { id: args.cartId }, select: { acceptedTotalCents: true, depositPercent: true, paymentLinkToken: true } });
  if (!cart) throw new Error("Post-payment cart not found");
  const job: Job = {
    version: 1, status: "PENDING", args, cartOwner, steps, lease: null,
    invoiceEnabled: process.env.FACTURASCRIPTS_SYNC_ENABLED === "true",
    affiliateBaseCents: cart.acceptedTotalCents ?? Math.round(args.amountCents / (1 + IVA_RATE)),
    quote: { acceptedTotalCents: cart.acceptedTotalCents, depositPercent: cart.depositPercent, paymentLinkToken: cart.paymentLinkToken,
      itemsFingerprint: await readPaymentItemsFingerprint(tx, args.cartId) },
    createdAt: new Date().toISOString(),
  };
  if (!job.invoiceEnabled) job.steps.invoice = { state: "DONE", reason: "Facturación automática desactivada" };
  await tx.adminSetting.upsert({
    where: { key: `${PREFIX}${args.paymentId}` },
    create: { key: `${PREFIX}${args.paymentId}`, value: json(job) },
    update: {},
  });
}

async function replace(tx: Prisma.TransactionClient, before: Job, after: Job): Promise<void> {
  const changed = await tx.adminSetting.updateMany({
    where: { key: `${PREFIX}${before.args.paymentId}`, value: { equals: json(before) } },
    data: { value: json(after) },
  });
  if (changed.count !== 1) throw new LeaseLost();
}

/** Append with compare-and-swap; neither concurrent admin notes nor an existing
 * payment review reason are overwritten. A failure rolls back the job closure.
 */
async function makeReviewVisible(tx: Prisma.TransactionClient, job: Job): Promise<void> {
  const reviews = STEPS.filter((step) => job.steps[step].state === "REVIEW_REQUIRED");
  if (!reviews.length) return;
  const reasons = [...new Set(reviews.map((step) => job.steps[step].reason).filter(Boolean))].join("; ");
  const note = `[Postpago ${job.args.paymentId}] Revisión necesaria: ${reviews.map((step) => LABEL[step]).join(", ")}. ${reasons}. No repetir operaciones externas sin comprobar su resultado.`;
  const payment = await tx.payment.findUnique({ where: { id: job.args.paymentId }, select: { failureReason: true } });
  if (payment && !payment.failureReason?.includes(note)) {
    const saved = await tx.payment.updateMany({
      where: { id: job.args.paymentId, failureReason: payment.failureReason },
      data: { failureReason: [payment.failureReason, note].filter(Boolean).join("\n") },
    });
    if (saved.count !== 1) throw new LocalPending();
  }
  const cart = await tx.cartQuote.findUnique({ where: { id: job.args.cartId }, select: { internalNotes: true } });
  if (cart && !cart.internalNotes?.includes(note)) {
    const saved = await tx.cartQuote.updateMany({
      where: { id: job.args.cartId, internalNotes: cart.internalNotes },
      data: { internalNotes: [cart.internalNotes, note].filter(Boolean).join("\n") },
    });
    if (saved.count !== 1) throw new LocalPending();
  }
}

/** Local economic effects and their receipt commit atomically. Rates/formulas
 * match the existing referral and affiliate helpers; only delivery changes.
 */
async function runLocal(tx: Prisma.TransactionClient, step: Step, job: Job): Promise<void> {
  const { cartId, customer } = job.args;
  if (step === "magicLink") {
    const user = await tx.customerUser.upsert({
      where: { email: customer.email.toLowerCase() },
      create: { email: customer.email.toLowerCase(), name: customer.name, company: customer.company },
      update: {},
    });
    if (!user.active) { job.portalLink = null; return; }
    const token = `cmlt_${randomBytes(20).toString("base64url")}`;
    await tx.customerUser.update({
      where: { id: user.id },
      data: { magicLinkToken: token, magicLinkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) },
    });
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.startidea.es";
    job.portalLink = `${site}/api/clientes/auth/consume/${token}`;
    return;
  }
  const base = job.affiliateBaseCents;
  if (step === "referral") {
    const referral = await tx.referral.findUnique({ where: { cartId }, include: { partner: true } });
    if (!referral || referral.status !== "LEAD") return;
    const commission = Math.round(base * referral.partner.commissionPct / 100);
    const changed = await tx.referral.updateMany({
      where: { id: referral.id, status: "LEAD" },
      data: { status: "EARNED", baseAmountCents: base, commissionCents: commission },
    });
    if (changed.count === 1) await tx.affiliatePartner.update({
      where: { id: referral.partnerId }, data: { totalEarnedCents: { increment: commission } },
    });
    return;
  }
  const redemption = await tx.couponRedemption.findUnique({ where: { cartId }, select: { couponId: true } });
  if (!redemption) return;
  const coupon = await tx.coupon.findUnique({ where: { id: redemption.couponId }, include: { affiliate: true } });
  if (!coupon?.affiliate?.active) return;
  const existing = await tx.affiliateLedgerEntry.findMany({
    where: { cartId, kind: { in: ["COMMISSION", "CREDIT"] } }, select: { id: true },
  });
  if (existing.length) return;
  const partner = coupon.affiliate;
  const commissionPct = coupon.commissionPctOverride ?? partner.commissionPct;
  const creditPct = coupon.creditPctOverride ?? partner.creditPct;
  for (const entry of [
    { kind: "COMMISSION" as const, pct: commissionPct, suffix: "sobre" },
    { kind: "CREDIT" as const, pct: creditPct, suffix: "crédito sobre" },
  ]) {
    const amount = Math.round(base * entry.pct / 100);
    if (amount <= 0) continue;
    await tx.affiliateLedgerEntry.create({ data: {
      partnerId: partner.id, kind: entry.kind, amountCents: amount, cartId,
      couponId: coupon.id, createdBy: "system",
      note: `Cupón ${coupon.code} · ${entry.pct}% ${entry.suffix} ${(base / 100).toFixed(2)}€`,
    } });
  }
}

function checkedResult(result: unknown): void {
  if (result === false || (result && typeof result === "object" && "ok" in result && result.ok === false)) {
    throw new ReviewRequired("El servicio no confirmó un resultado correcto");
  }
  if (result && typeof result === "object" && "skipped" in result && "reason" in result) {
    const reason = String(result.reason);
    // Busy is not success: the other claimant might never complete. Missing
    // data and dry-runs likewise remain visible for manual completion.
    if (!/AUTO_PLACE_ON_PAYMENT=false|no hay productos|no tiene productos|Ya tiene orderId/.test(reason)) {
      throw new ReviewRequired("Operación omitida sin resultado final confirmado");
    }
  }
  if (result && typeof result === "object" && "notified" in result && result.notified) {
    throw new ReviewRequired("El pedido al proveedor requiere gestión manual");
  }
  if (result && typeof result === "object" && "dryRun" in result && result.dryRun) {
    throw new ReviewRequired("Pedido preparado para gestión manual (simulación)");
  }
}

async function runEffect(step: Step, job: Job): Promise<void> {
  const { cartId, paymentId, customer, amountCents, currency, via, receiptUrl } = job.args;
  const amountFmt = (amountCents / 100).toFixed(2);
  const viaLabel = via === "express-checkout" ? " (Apple/Google Pay)" : "";
  if (step === "split") {
    await createPurchaseOrdersFromCart(cartId, job.quote.itemsFingerprint);
    // The helper can return early when another split owns its lock. Only a
    // complete assignment proves success; never launch adapters on partial POs.
    const unassigned = await prisma.cartQuoteItem.count({ where: { cartId, purchaseOrderId: null } });
    if (unassigned) throw new LocalPending();
    return;
  }
  if (step === "midocean") return checkedResult(await autoPlaceMidoceanOrder(cartId, job.quote.itemsFingerprint));
  if (step === "cifra") return checkedResult(await autoPlaceCifraOrder(cartId, job.quote.itemsFingerprint));
  if (step === "makito") return checkedResult(await autoPlaceMakitoOrder(cartId, job.quote.itemsFingerprint));
  if (step === "telegram") return checkedResult(await notifyTelegram(
    `💰 <b>Pago recibido</b>${viaLabel}\n${escapeTgHtml(customer.name)}${customer.company ? ` · ${escapeTgHtml(customer.company)}` : ""}\n<b>${amountFmt} €</b>\n📧 ${escapeTgHtml(customer.email)}`,
  ));
  if (step === "webhook") return emitWebhook("payment.completed", {
    cartId, paymentId, amountCents, currency, paidAt: job.createdAt, via,
  });
  if (step === "invoice") {
    // Both enqueue-time and execution-time gates must allow issuance.
    if (process.env.FACTURASCRIPTS_SYNC_ENABLED !== "true") return;
    return checkedResult(await syncPaymentToFacturaScripts(paymentId, job.quote.itemsFingerprint));
  }
  if (step === "internalEmail") {
    const cart = await prisma.cartQuote.findUnique({ where: { id: cartId }, select: { items: { select: {
      productName: true, productRef: true, quantity: true, customerLogoUrl: true,
      customerLogoFilename: true, markingTechniqueName: true, markingPositionId: true, markingColours: true,
    } } } });
    return checkedResult(await sendEmail({
      to: RESEND_TO_INTERNAL,
      subject: `[Pago recibido] ${customer.name}${customer.company ? " · " + customer.company : ""} · ${amountFmt}€${via === "express-checkout" ? " (wallet)" : ""}`,
      html: internalPaymentEmailHtml({ customer, amountFmt, cartId, viaLabel, receiptUrl, items: cart?.items || [] }),
      context: `stripe paid · ${cartId}`,
    }));
  }
  const firstName = customer.name.split(" ")[0];
  return checkedResult(await sendEmail({
    to: customer.email, subject: `Hemos recibido tu pago — gracias ${firstName}`,
    html: clientPaidEmailHtml({ firstName, amountFmt, cartId, portalLink: job.portalLink ?? null, receiptUrl }),
    context: `stripe paid client · ${cartId}`,
  }));
}

/** Releer antes de cada paso: un cobro devuelto o un presupuesto cambiado
 * mientras esperaba la cola no debe activar pedidos, comisiones ni correos.
 */
async function unsafePaymentReason(job: Job): Promise<string | null> {
  const [payment, cart] = await Promise.all([
    prisma.payment.findUnique({ where: { id: job.args.paymentId }, select: { status: true, amountCents: true, currency: true, cartId: true } }),
    prisma.cartQuote.findUnique({ where: { id: job.args.cartId }, select: { acceptedTotalCents: true, depositPercent: true, paymentLinkToken: true } }),
  ]);
  if (!payment || payment.status !== "PAID") return "El pago ya no está confirmado; revisar antes de continuar";
  if (payment.cartId !== job.args.cartId || payment.amountCents !== job.args.amountCents || payment.currency.toLowerCase() !== job.args.currency.toLowerCase()) {
    return "Los datos del pago cambiaron; revisar antes de continuar";
  }
  if (!cart || cart.acceptedTotalCents !== job.quote.acceptedTotalCents || cart.depositPercent !== job.quote.depositPercent || cart.paymentLinkToken !== job.quote.paymentLinkToken ||
      !job.quote.itemsFingerprint || job.quote.itemsFingerprint !== await readPaymentItemsFingerprint(prisma, job.args.cartId)) {
    return "Las condiciones del presupuesto cambiaron después del cobro";
  }
  return null;
}

export type PostPaymentResult = { status: "missing" | "busy" | "pending" | "done" | "review_required"; paymentId: string };

/** A timeout/crash after STARTED cannot prove that an external side effect did
 * not happen. Recovery quarantines that step, but continues independent work.
 * CAS protects every transition and rejects completion by an expired owner.
 */
export async function processStripePostPayment(paymentId: string): Promise<PostPaymentResult> {
  const row = await prisma.adminSetting.findUnique({ where: { key: `${PREFIX}${paymentId}` } });
  if (!row) return { status: "missing", paymentId };
  let job = decode(row.value);
  if (job.status === "DONE" || job.status === "REVIEW_REQUIRED") return { status: job.status === "DONE" ? "done" : "review_required", paymentId };
  if (job.lease && job.lease.until > Date.now()) return { status: "busy", paymentId };
  const claimed = structuredClone(job);
  claimed.status = "PROCESSING";
  claimed.lease = { token: randomUUID(), until: Date.now() + LEASE_MS };
  for (const step of STEPS) if (claimed.steps[step].state === "STARTED") {
    claimed.steps[step] = step === "split" || LOCAL_STEPS.includes(step)
      ? { state: "PENDING" }
      : { state: "REVIEW_REQUIRED", reason: "La ejecución anterior se interrumpió después de iniciar esta operación" };
  }
  try { await replace(prisma, job, claimed); } catch (error) {
    if (error instanceof LeaseLost) return { status: "busy", paymentId };
    throw error;
  }
  job = claimed;
  try {
    for (const step of STEPS) {
      if (job.steps[step].state !== "PENDING") continue;
      const unsafeReason = await unsafePaymentReason(job);
      if (unsafeReason) {
        const contained = structuredClone(job);
        for (const pending of STEPS) if (contained.steps[pending].state === "PENDING") {
          contained.steps[pending] = { state: "REVIEW_REQUIRED", reason: unsafeReason };
        }
        await replace(prisma, job, contained);
        job = contained;
        break;
      }
      if (["midocean", "cifra", "makito"].includes(step) && job.steps.split.state !== "DONE") continue;
      if (step === "customerEmail" && job.steps.magicLink.state !== "DONE") continue;
      if (LOCAL_STEPS.includes(step)) {
        const next = structuredClone(job);
        next.lease!.until = Date.now() + LEASE_MS;
        try {
          await prisma.$transaction(async (tx) => {
            // Claim the row before local writes; a lost lease rolls back all.
            await replace(tx, job, next);
            const done = structuredClone(next);
            await runLocal(tx, step, done);
            done.steps[step] = { state: "DONE" };
            await replace(tx, next, done);
            Object.assign(next, done);
          });
          job = next;
        } catch (error) {
          if (error instanceof LeaseLost) throw error;
          // Local writes + receipt rolled back together. Cron can safely retry.
        }
        continue;
      }
      const started = structuredClone(job);
      started.steps[step] = { state: "STARTED" };
      started.lease!.until = Date.now() + LEASE_MS;
      await replace(prisma, job, started);
      job = started;
      const finished = structuredClone(job);
      try {
        await runEffect(step, job);
        finished.steps[step] = { state: "DONE" };
      } catch (error) {
        finished.steps[step] = step === "split"
          ? { state: "PENDING", reason: "Reparto del carrito incompleto" }
          : { state: "REVIEW_REQUIRED", reason: error instanceof ReviewRequired ? error.message : "La operación falló o no se pudo confirmar su resultado" };
      }
      await replace(prisma, job, finished);
      job = finished;
    }
    const finished = structuredClone(job);
    finished.lease = null;
    finished.status = STEPS.some((step) => finished.steps[step].state === "PENDING") ? "PENDING"
      : STEPS.some((step) => finished.steps[step].state === "REVIEW_REQUIRED") ? "REVIEW_REQUIRED" : "DONE";
    await prisma.$transaction(async (tx) => {
      await replace(tx, job, finished);
      await makeReviewVisible(tx, finished);
    });
    return { status: finished.status === "DONE" ? "done" : finished.status === "REVIEW_REQUIRED" ? "review_required" : "pending", paymentId };
  } catch (error) {
    if (error instanceof LeaseLost) return { status: "busy", paymentId };
    throw error;
  }
}

/** Filter before limiting: completed receipts never starve unfinished work.
 * No historical paid rows are backfilled (their external effects are unknown).
 */
export async function retryStripePostPayments(limit = 3): Promise<{ checked: number; results: PostPaymentResult[] }> {
  const rows = await prisma.adminSetting.findMany({
    where: {
      key: { startsWith: PREFIX },
      OR: [
        { value: { path: ["status"], equals: "PENDING" } },
        { value: { path: ["status"], equals: "PROCESSING" } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(10, Math.max(1, Math.trunc(limit) || 3)),
    select: { key: true },
  });
  const results: PostPaymentResult[] = [];
  for (const row of rows) {
    const paymentId = row.key.slice(PREFIX.length);
    try { results.push(await processStripePostPayment(paymentId)); }
    catch { results.push({ paymentId, status: "pending" }); }
  }
  return { checked: rows.length, results };
}
