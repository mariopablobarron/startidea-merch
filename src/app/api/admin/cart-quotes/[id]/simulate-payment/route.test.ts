/**
 * Tests para POST /api/admin/cart-quotes/[id]/simulate-payment.
 *
 * `name` lo escribe quien rellena el formulario público de cotización
 * (/api/cart-quote) — es dato de usuario sin confiar, no algo que controle
 * Startidea, aunque quien DISPARA esta ruta sea un admin. El email
 * "[TEST] simulación de pago" interpola el saludo con `firstName`
 * (derivado de `name`) en el HTML del mensaje. Un nombre con markup sin
 * escapar podría inyectar un link o script suplantando la marca de
 * TodoMerchandising dentro de un email que el cliente sí espera recibir.
 *
 * Se comprueba el HTML real que le llega a `sendEmail`, con literales
 * fijos — nunca reconstruyendo el escapado con `escapeHtml` dentro del
 * test, porque eso pasaría en verde aunque se quitara el escape real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const paymentCreate = vi.fn();
const cartQuoteUpdate = vi.fn();
const sendEmail = vi.fn();
const authenticateAdminRequest = vi.fn();
const createPurchaseOrdersFromCart = vi.fn();
const syncPaymentToFacturaScripts = vi.fn();
const notifyTelegram = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => cartQuoteUpdate(...a),
    },
    payment: {
      create: (...a: unknown[]) => paymentCreate(...a),
    },
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  authenticateAdminRequest: (...a: unknown[]) => authenticateAdminRequest(...a),
}));

vi.mock("@/lib/purchase-orders", () => ({
  createPurchaseOrdersFromCart: (...a: unknown[]) => createPurchaseOrdersFromCart(...a),
}));

vi.mock("@/lib/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

vi.mock("@/lib/facturascripts-sync", () => ({
  syncPaymentToFacturaScripts: (...a: unknown[]) => syncPaymentToFacturaScripts(...a),
}));

vi.mock("@/lib/telegram", () => ({
  notifyTelegram: (...a: unknown[]) => notifyTelegram(...a),
  escapeTgHtml: (s: string | null | undefined) => s ?? "",
}));

import { POST } from "./route";

function makeReq(): Request {
  return new Request("https://test/api/admin/cart-quotes/cart_atk/simulate-payment", {
    method: "POST",
  });
}

const ATTACK_NAME = '<script>alert(1)</script>"onmouseover="x';

beforeEach(() => {
  findUnique.mockReset();
  paymentCreate.mockReset();
  cartQuoteUpdate.mockReset();
  sendEmail.mockReset();
  authenticateAdminRequest.mockReset();
  createPurchaseOrdersFromCart.mockReset();
  syncPaymentToFacturaScripts.mockReset();
  notifyTelegram.mockReset();

  authenticateAdminRequest.mockResolvedValue({
    userId: "admin_1",
    email: "admin@startidea.es",
    name: "Admin",
    role: "CEO",
  });
  findUnique.mockResolvedValue({
    id: "cart_atk",
    name: ATTACK_NAME,
    email: "atacante@example.com",
    acceptedTotalCents: 1000,
    items: [],
    payments: [],
  });
  paymentCreate.mockResolvedValue({ id: "payment_1" });
  cartQuoteUpdate.mockResolvedValue({ id: "cart_atk" });
  createPurchaseOrdersFromCart.mockResolvedValue([]);
  syncPaymentToFacturaScripts.mockResolvedValue({ ok: true });
  sendEmail.mockResolvedValue({ ok: true });
  notifyTelegram.mockResolvedValue(true);
});

describe("simulate-payment · escapado HTML de datos de usuario", () => {
  it("el nombre malicioso sale escapado en el saludo del email [TEST]", async () => {
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "cart_atk" }) });
    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;onmouseover=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onmouseover="x"');
  });
});
