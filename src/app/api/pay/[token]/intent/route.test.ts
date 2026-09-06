import { beforeEach, describe, expect, it, vi } from "vitest";

const findCart = vi.fn();
const start = vi.fn();
const create = vi.fn();
const variants = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { cartQuote: { findUnique: (...args: unknown[]) => findCart(...args) } } }));
vi.mock("@/lib/stripe", () => ({
  stripe: { paymentIntents: { create: (...args: unknown[]) => create(...args) },
    checkout: { sessions: { create: (...args: unknown[]) => create(...args) } } },
  STRIPE_MODE: "test",
}));
vi.mock("@/lib/supplier-order-variant", () => ({ resolveSupplierOrderVariants: (...args: unknown[]) => variants(...args) }));
vi.mock("@/lib/payment-attempts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/payment-attempts")>();
  return { ...original, startPaymentAttempt: (...args: unknown[]) => start(...args) };
});
const cart = { id: "cart_1", email: "test@example.com", name: "Cliente", company: null,
  acceptedTotalCents: 10_000, depositPercent: 50, paymentLinkToken: "tok",
  paymentLinkExpiresAt: null, payments: [], items: [{ id: "i1" }] };
async function post() {
  const { POST } = await import("./route");
  return POST(new Request("https://example.test/api/pay/tok/intent", { method: "POST" }), {
    params: Promise.resolve({ token: "tok" }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.STRIPE_TAX_ENABLED;
  findCart.mockResolvedValue(cart);
  variants.mockResolvedValue({ ok: true });
  start.mockResolvedValue({ object: "payment_intent", id: "pi_test", client_secret: "secret_test" });
});

describe("POST /pay/[token]/intent — intento durable", () => {
  it("delegación con importe e IVA vigentes, sin crear Stripe antes de reservar", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toMatchObject({ channel: "wallet", mode: "test",
      quote: { amountCents: 6050, acceptedTotalCents: 10_000, depositPercent: 50,
        paymentLinkToken: "tok", currency: "eur", kind: "DEPOSIT", taxEnabled: false } });
    expect(create).not.toHaveBeenCalled();
  });
  it("callback crea con los parámetros congelados y la clave que entrega la reserva", async () => {
    await post();
    const { create: callback } = start.mock.calls[0][0];
    const params = { metadata: { paymentId: "pay_1" }, immutable: true };
    const options = { idempotencyKey: "merch:test:pay_1:wallet", timeout: 10000 };
    await callback({ params }, options);
    expect(create).toHaveBeenCalledWith(params, options);
  });
  it.each([
    [null, 404],
    [{ ...cart, acceptedTotalCents: null }, 400],
    [{ ...cart, payments: [{ status: "PAID" }] }, 409],
    [{ ...cart, paymentLinkExpiresAt: new Date(0) }, 410],
  ])("con cotización no cobrable devuelve %s / %s sin reservar", async (value, expectedStatus) => {
    findCart.mockResolvedValue(value);
    expect((await post()).status).toBe(expectedStatus);
    expect(start).not.toHaveBeenCalled();
  });
  it("propaga conflicto de intento sin perder la posibilidad de reintento", async () => {
    const { PaymentAttemptError } = await import("@/lib/payment-attempts");
    start.mockRejectedValueOnce(new PaymentAttemptError(409, "Pago en curso"));
    const response = await post(); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Pago en curso" });
  });
  it("fallo incierto devuelve 503 y no expone respuesta interna de Stripe", async () => {
    start.mockRejectedValueOnce(new Error("secret-sensitive-value"));
    const response = await post(); expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret-sensitive-value");
  });
  it("wallet conserva IVA manual aunque exista Stripe Tax para hosted", async () => {
    process.env.STRIPE_TAX_ENABLED = "true";
    await post();
    expect(start.mock.calls[0][0].quote).toMatchObject({ amountCents: 6050, taxEnabled: false });
    expect(start.mock.calls[0][0].params.amount).toBe(6050);
  });
});
