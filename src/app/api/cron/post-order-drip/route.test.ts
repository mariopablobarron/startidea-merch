/**
 * Tests para POST /api/cron/post-order-drip.
 *
 * Este cron manda emails REALES a clientes (D0 gracias, D14 memoria RSC,
 * D45 cupón del 10%). Lo que se fija aquí es el orden claim-then-send: la fila
 * de EmailDripSent debe reclamarse ANTES de enviar, porque la unique
 * (cartId, step) es el único cerrojo que impide que dos ejecuciones solapadas
 * —el cron de las 07:00 y un disparo manual desde /admin/system/crons— manden
 * el mismo email dos veces al mismo cliente.
 *
 * Antes del 2026-07-23 el orden era el inverso (findUnique → enviar → create),
 * con una ventana de carrera entre la comprobación y el envío.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const dripCreate = vi.fn();
const dripDelete = vi.fn();
const couponUpsert = vi.fn();
const sendEmail = vi.fn();
const requireCronSecret = vi.fn();
const withCronLock = vi.fn();

/** Traza del orden real de los efectos, para probar quién va antes que quién. */
let calls: string[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: {
      findMany: (...a: unknown[]) => findMany(...a),
    },
    emailDripSent: {
      create: (...a: unknown[]) => {
        calls.push("claim");
        return dripCreate(...a);
      },
      delete: (...a: unknown[]) => {
        calls.push("release");
        return dripDelete(...a);
      },
    },
    coupon: {
      upsert: (...a: unknown[]) => couponUpsert(...a),
    },
  },
}));

vi.mock("@/lib/resend", () => ({
  sendEmail: (...a: unknown[]) => {
    calls.push("send");
    return sendEmail(...a);
  },
}));

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));

vi.mock("@/lib/cron-lock", () => ({
  withCronLock: (...a: unknown[]) => withCronLock(...a),
}));

vi.mock("@/lib/cron-tracking", () => ({
  // Passthrough: la telemetría no es lo que se prueba aquí.
  wrapCronHandler: (_name: string, handler: (req: Request) => Promise<Response>) => handler,
}));

import { POST } from "./route";

function makeReq(): Request {
  return new Request("https://test/api/cron/post-order-drip", {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

/** Un pedido entregado que cae dentro de la ventana de UN solo step (D0). */
function cart(id = "cart_1") {
  return {
    id,
    name: "Ana Ruiz",
    email: "ana@example.com",
    company: "Acme",
    items: [{ quantity: 3 }],
    customerToken: "tok_1",
  };
}

/** Solo el primer step (D0) encuentra candidatos; D14 y D45 vacíos. */
function onlyFirstStepHasCandidates(rows: ReturnType<typeof cart>[]) {
  findMany.mockResolvedValueOnce(rows).mockResolvedValue([]);
}

beforeEach(() => {
  calls = [];
  findMany.mockReset();
  dripCreate.mockReset();
  dripDelete.mockReset();
  couponUpsert.mockReset();
  sendEmail.mockReset();
  requireCronSecret.mockReset();
  withCronLock.mockReset();

  requireCronSecret.mockReturnValue({ ok: true });
  // El lock deja pasar: aquí se prueba el claim por fila, no la exclusión mutua.
  withCronLock.mockImplementation((_key: string, fn: () => Promise<Response>) => fn());
  dripCreate.mockResolvedValue({ id: "drip_1" });
  dripDelete.mockResolvedValue({ id: "drip_1" });
  couponUpsert.mockResolvedValue({ id: "coupon_1" });
  sendEmail.mockResolvedValue({ ok: true });
});

describe("post-order-drip · claim-then-send", () => {
  it("reclama EmailDripSent ANTES de enviar el email (no al revés)", async () => {
    onlyFirstStepHasCandidates([cart()]);

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    expect(calls).toEqual(["claim", "send"]);
    expect(calls.indexOf("claim")).toBeLessThan(calls.indexOf("send"));
  });

  it("si el claim falla (otra ejecución lo tomó) NO envía el email", async () => {
    onlyFirstStepHasCandidates([cart()]);
    // Violación de la unique (cartId, step): ya reclamado.
    dripCreate.mockRejectedValueOnce(new Error("Unique constraint failed"));

    const res = await POST(makeReq());
    const body = (await res.json()) as { ok: boolean; sent: Record<string, number> };

    expect(sendEmail).not.toHaveBeenCalled();
    expect(calls).toEqual(["claim"]);
    expect(body.sent.D0).toBe(0);
  });

  it("dos ejecuciones solapadas mandan el email UNA sola vez", async () => {
    // Primera pasada: gana el claim y envía. Segunda: la unique la rechaza.
    findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([]);
    await POST(makeReq());

    calls = [];
    findMany.mockReset();
    findMany.mockResolvedValueOnce([cart()]).mockResolvedValue([]);
    dripCreate.mockRejectedValueOnce(new Error("Unique constraint failed"));
    await POST(makeReq());

    // Un único envío en total, pese a dos ejecuciones sobre el mismo carrito.
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("si el envío falla libera el claim para que mañana reintente", async () => {
    onlyFirstStepHasCandidates([cart()]);
    sendEmail.mockRejectedValueOnce(new Error("Resend 500"));

    const res = await POST(makeReq());
    const body = (await res.json()) as {
      ok: boolean;
      errors: string[];
      sent: Record<string, number>;
    };

    expect(calls).toEqual(["claim", "send", "release"]);
    expect(dripDelete).toHaveBeenCalledWith({
      where: { cartId_step: { cartId: "cart_1", step: 0 } },
    });
    expect(body.errors).toHaveLength(1);
    expect(body.sent).toBeDefined();
  });

  it("un fallo de envío no impide procesar el resto de carritos", async () => {
    onlyFirstStepHasCandidates([cart("cart_1"), cart("cart_2")]);
    sendEmail.mockRejectedValueOnce(new Error("Resend 500"));

    const res = await POST(makeReq());
    const body = (await res.json()) as { sent: Record<string, number>; errors: string[] };

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(body.errors).toHaveLength(1);
    expect(body.sent.D0).toBe(1);
  });

  it("corre bajo el cerrojo de cron con su propia clave", async () => {
    onlyFirstStepHasCandidates([]);

    await POST(makeReq());

    expect(withCronLock).toHaveBeenCalledTimes(1);
    expect(withCronLock.mock.calls[0][0]).toBe("post-order-drip");
  });

  it("sin secreto de cron válido no toca la BD ni envía nada", async () => {
    requireCronSecret.mockReturnValue({ ok: false, reason: "no autorizado", status: 401 });

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

/**
 * Tests de escapado HTML en el drip post-pedido.
 *
 * `name` lo escribe quien rellena el formulario público de cotización
 * (/api/cart-quote) — es dato de usuario sin confiar, no algo que controle
 * Startidea. Los tres pasos del drip (D0, D14, D45) interpolan el saludo con
 * `firstName` en el HTML del email, y el paso D45 además interpola el código
 * de cupón (derivado de `firstName`) dentro de una tarjeta de descuento. Un
 * nombre con markup sin escapar podría inyectar un link o script suplantando
 * la marca de TodoMerchandising dentro de un email que el cliente sí espera
 * recibir. Se comprueba el HTML real que le llega a `sendEmail`, con
 * literales fijos — nunca reconstruyendo el escapado con `escapeHtml` dentro
 * del test, porque eso pasaría en verde aunque se quitara el escape real.
 */
const ATTACK_NAME = '<script>alert(1)</script>"onmouseover="x';

function cartWithName(name: string, id = "cart_atk") {
  return {
    id,
    name,
    email: "atacante@example.com",
    company: "Acme",
    items: [{ quantity: 2 }],
    customerToken: "tok_atk",
  };
}

describe("post-order-drip · escapado HTML de datos de usuario", () => {
  beforeEach(() => {
    couponUpsert.mockResolvedValue({ id: "coupon_1" });
  });

  it("D0 (gracias): el nombre malicioso sale escapado en el saludo", async () => {
    findMany.mockResolvedValueOnce([cartWithName(ATTACK_NAME)]).mockResolvedValue([]);

    await POST(makeReq());

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;onmouseover=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onmouseover="x"');
  });

  it("D14 (memoria RSC): el nombre malicioso sale escapado en el saludo", async () => {
    findMany
      .mockResolvedValueOnce([]) // D0 sin candidatos
      .mockResolvedValueOnce([cartWithName(ATTACK_NAME)]) // D14
      .mockResolvedValue([]); // D45 sin candidatos

    await POST(makeReq());

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;onmouseover=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('onmouseover="x"');
  });

  it("D45 (cupón 10%): el nombre malicioso sale escapado en el saludo y en el código del cupón", async () => {
    findMany
      .mockResolvedValueOnce([]) // D0 sin candidatos
      .mockResolvedValueOnce([]) // D14 sin candidatos
      .mockResolvedValueOnce([cartWithName(ATTACK_NAME)]) // D45
      .mockResolvedValue([]);

    await POST(makeReq());

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const html = (sendEmail.mock.calls[0][0] as { html: string }).html;
    // Saludo
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;onmouseover=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    // Código de cupón: derivado de los 4 primeros chars del nombre en
    // mayúsculas ("<scr" → "<SCR10"); el "<" también debe salir escapado.
    expect(html).toContain("&lt;SCR10");
    expect(html).not.toContain("<SCR10");
  });
});
