/**
 * Tests para POST /api/cron/review-invite.
 *
 * `name` lo escribe quien rellena el formulario público de cotización
 * (/api/cart-quote) — es dato de usuario sin confiar, no algo que controle
 * Startidea. El email de invitación a review interpola el saludo con
 * `firstName` (derivado de `name`) en el HTML del mensaje. Un nombre con
 * markup sin escapar podría inyectar un link o script suplantando la marca
 * de TodoMerchandising dentro de un email que el cliente sí espera recibir.
 *
 * Se comprueba el HTML real que le llega a `sendEmail`, con literales
 * fijos — nunca reconstruyendo el escapado con `escapeHtml` dentro del
 * test, porque eso pasaría en verde aunque se quitara el escape real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const emailDripCreate = vi.fn();
const reviewCreate = vi.fn();
const sendEmail = vi.fn();
const requireCronSecret = vi.fn();
const withCronLock = vi.fn();
const reviewInviteEligibility = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: {
      findMany: (...a: unknown[]) => findMany(...a),
    },
    emailDripSent: {
      create: (...a: unknown[]) => emailDripCreate(...a),
    },
    review: {
      create: (...a: unknown[]) => reviewCreate(...a),
    },
  },
}));

vi.mock("@/lib/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));

vi.mock("@/lib/cron-lock", () => ({
  withCronLock: (...a: unknown[]) => withCronLock(...a),
}));

vi.mock("@/lib/cron-tracking", () => ({
  wrapCronHandler: (_name: string, handler: (req: Request) => Promise<Response>) => handler,
}));

vi.mock("@/lib/review-invite-eligibility", () => ({
  reviewInviteEligibility: (...a: unknown[]) => reviewInviteEligibility(...a),
}));

import { POST } from "./route";

function makeReq(): Request {
  return new Request("https://test/api/cron/review-invite", {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

const ATTACK_NAME = '<script>alert(1)</script>"onmouseover="x';

function cartWithName(name: string, id = "cart_atk") {
  return {
    id,
    name,
    email: "atacante@example.com",
    company: "Acme",
    orderedAt: new Date("2026-08-01T00:00:00Z"),
    purchaseOrders: [{ status: "DELIVERED", deliveredAt: new Date("2026-08-02T00:00:00Z") }],
  };
}

beforeEach(() => {
  findMany.mockReset();
  emailDripCreate.mockReset();
  reviewCreate.mockReset();
  sendEmail.mockReset();
  requireCronSecret.mockReset();
  withCronLock.mockReset();
  reviewInviteEligibility.mockReset();

  requireCronSecret.mockReturnValue({ ok: true });
  withCronLock.mockImplementation((_key: string, fn: () => Promise<Response>) => fn());
  emailDripCreate.mockResolvedValue({ id: "drip_1" });
  reviewCreate.mockResolvedValue({ id: "review_1", token: "tok_review_1" });
  sendEmail.mockResolvedValue({ ok: true });
  reviewInviteEligibility.mockReturnValue({ eligible: true, signal: "delivered", deliveredAt: new Date() });
});

describe("review-invite · escapado HTML de datos de usuario", () => {
  it("el nombre malicioso sale escapado en el saludo del email de invitación", async () => {
    findMany.mockResolvedValueOnce([cartWithName(ATTACK_NAME)]);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;onmouseover=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onmouseover="x"');
  });
});
