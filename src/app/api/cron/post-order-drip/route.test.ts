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
  sendEmail.mockReset();
  requireCronSecret.mockReset();
  withCronLock.mockReset();

  requireCronSecret.mockReturnValue({ ok: true });
  // El lock deja pasar: aquí se prueba el claim por fila, no la exclusión mutua.
  withCronLock.mockImplementation((_key: string, fn: () => Promise<Response>) => fn());
  dripCreate.mockResolvedValue({ id: "drip_1" });
  dripDelete.mockResolvedValue({ id: "drip_1" });
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
