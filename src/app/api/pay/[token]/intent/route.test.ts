/**
 * Tests para POST /api/pay/[token]/intent (Express Checkout).
 *
 * Lo que se vigila aquí es de DINERO. La ruta reutiliza una fila `Payment`
 * PENDING del mismo carrito en vez de crear una nueva, para no dejar
 * gemelas por cada clic. El matiz que importa es CUÁL reutiliza: una fila
 * creada por /checkout ya lleva su `stripeSessionId`, y escribirle encima
 * el PaymentIntent de este otro camino la deja apuntando a dos cobros
 * distintos. Si luego se cobra la sesión, la fila queda PAID y el
 * `payment_intent.succeeded` del segundo cobro —real— se descarta por
 * "ya procesado": dos cobros, un solo Payment.
 *
 * Medido en producción el 02-sep: de los 3 carritos con pagos, el único
 * que llegó a cobrar usó LOS DOS caminos (una fila sin sesión + otra con
 * `cs_live`). Ese día el orden de los clics fue el inocuo; el inverso es
 * el que rompe. No es un escenario teórico.
 *
 * Se comprueba el `where` real que recibe Prisma, no un resultado
 * derivado: es la única forma de que el test suspenda si alguien quita el
 * filtro.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cartFindUnique = vi.fn();
const paymentFindFirst = vi.fn();
const paymentUpdate = vi.fn();
const paymentCreate = vi.fn();
const intentsCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: { findUnique: (...a: unknown[]) => cartFindUnique(...a) },
    payment: {
      findFirst: (...a: unknown[]) => paymentFindFirst(...a),
      update: (...a: unknown[]) => paymentUpdate(...a),
      create: (...a: unknown[]) => paymentCreate(...a),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: { paymentIntents: { create: (...a: unknown[]) => intentsCreate(...a) } },
  STRIPE_MODE: "test",
}));

const CART = {
  id: "cart_1",
  email: "cliente@example.com",
  name: "Cliente",
  company: "ACME",
  acceptedTotalCents: 10_000,
  depositPercent: 100,
  paymentLinkExpiresAt: null,
  payments: [],
  items: [{ id: "i1" }],
};

async function post() {
  const { POST } = await import("./route");
  return POST(new Request("https://x/api/pay/tok/intent", { method: "POST" }), {
    params: Promise.resolve({ token: "tok" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  cartFindUnique.mockResolvedValue(CART);
  intentsCreate.mockResolvedValue({ id: "pi_nuevo", client_secret: "cs_secret" });
  paymentFindFirst.mockResolvedValue(null);
  paymentUpdate.mockResolvedValue({});
  paymentCreate.mockResolvedValue({});
});

describe("POST /api/pay/[token]/intent — reutilización de Payment PENDING", () => {
  it("sólo busca filas PENDING SIN stripeSessionId (no toca las del checkout hosted)", async () => {
    const res = await post();
    expect(res.status).toBe(200);

    expect(paymentFindFirst).toHaveBeenCalledTimes(1);
    const where = paymentFindFirst.mock.calls[0][0].where;
    expect(where.cartId).toBe("cart_1");
    expect(where.status).toBe("PENDING");
    // El filtro que impide contaminar una fila de Checkout Session.
    expect(where).toHaveProperty("stripeSessionId", null);
  });

  it("reutiliza la fila del propio Express Checkout en vez de duplicarla", async () => {
    paymentFindFirst.mockResolvedValue({ id: "pay_express", stripeSessionId: null });

    await post();

    expect(paymentCreate).not.toHaveBeenCalled();
    expect(paymentUpdate).toHaveBeenCalledTimes(1);
    expect(paymentUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "pay_express" },
      data: { stripePaymentIntentId: "pi_nuevo" },
    });
  });

  it("crea fila nueva cuando la única PENDING es de checkout hosted (findFirst no la devuelve)", async () => {
    // Con el filtro puesto, Prisma no devuelve la fila con sesión: el
    // camino correcto es CREAR, nunca actualizar la ajena.
    paymentFindFirst.mockResolvedValue(null);

    await post();

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(paymentCreate).toHaveBeenCalledTimes(1);
    const data = paymentCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      cartId: "cart_1",
      status: "PENDING",
      stripePaymentIntentId: "pi_nuevo",
    });
    // La fila nueva no inventa una sesión que no existe.
    expect(data.stripeSessionId).toBeUndefined();
  });
});
