/**
 * Tests para POST /api/cron/publish-scheduled.
 *
 * Este cron publica en REDES SOCIALES, a la vista del público. Lo que se fija
 * aquí es el orden claim-then-publish: la pieza debe salir de SCHEDULED con un
 * `updateMany` condicionado ANTES de llamar a Metricool, porque ese updateMany
 * es el único cerrojo que impide que dos ejecuciones solapadas —el tick del
 * cron y un disparo manual desde /admin/system/crons— publiquen el mismo post
 * dos veces.
 *
 * Antes del 2026-07-23 el orden era el inverso (SELECT SCHEDULED → publicar →
 * marcar PUBLISHED), con una ventana de carrera entre la lectura y el marcado.
 * Un post duplicado no se puede retirar, así que la dirección del fallo importa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const publishToMetricool = vi.fn();
const getMetricoolConfig = vi.fn();
const requireCronSecret = vi.fn();
const withCronLock = vi.fn();

/** Traza del orden real de los efectos, para probar quién va antes que quién. */
let calls: string[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contentPiece: {
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => {
        calls.push("claim");
        return updateMany(...a);
      },
      update: (...a: unknown[]) => {
        calls.push("annotate");
        return update(...a);
      },
    },
  },
}));

vi.mock("@/lib/metricool", () => ({
  getMetricoolConfig: (...a: unknown[]) => getMetricoolConfig(...a),
  publishToMetricool: (...a: unknown[]) => {
    calls.push("publish");
    return publishToMetricool(...a);
  },
  contentChannelToMetricool: (channel: string) =>
    channel === "EMAIL" || channel === "WEB" ? null : channel.toLowerCase(),
}));

vi.mock("@/lib/telegram", () => ({ notifyTelegram: vi.fn().mockResolvedValue(undefined) }));

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
  return new Request("https://test/api/cron/publish-scheduled", {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

function piece(id = "piece_1", channel = "INSTAGRAM") {
  return {
    id,
    channel,
    copy: "Texto del post",
    hashtags: ["merch"],
    creativeUrl: null,
    productSlug: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  requireCronSecret.mockReturnValue({ ok: true });
  // El lock deja pasar: aquí se prueba la dedup POR FILA, no el lock en sí.
  withCronLock.mockImplementation((_key: string, fn: () => Promise<Response>) => fn());
  getMetricoolConfig.mockResolvedValue({ token: "t", blogId: 1 });
  findMany.mockResolvedValue([piece()]);
  updateMany.mockResolvedValue({ count: 1 });
  update.mockResolvedValue({});
  publishToMetricool.mockResolvedValue({ ok: true, externalIds: ["ext_1"] });
});

describe("publish-scheduled · claim-then-publish", () => {
  it("reclama la pieza ANTES de publicarla en la red social", async () => {
    await POST(makeReq());

    expect(calls.indexOf("claim")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("publish")).toBeGreaterThanOrEqual(0);
    // El invariante: el cerrojo va primero. Con el orden viejo esto falla.
    expect(calls.indexOf("claim")).toBeLessThan(calls.indexOf("publish"));
  });

  it("el claim está condicionado a status SCHEDULED (es lo que lo hace atómico)", async () => {
    await POST(makeReq());

    const [args] = updateMany.mock.calls[0] as [{ where: Record<string, unknown>; data: Record<string, unknown> }];
    expect(args.where).toMatchObject({ id: "piece_1", status: "SCHEDULED" });
    expect(args.data).toMatchObject({ status: "PUBLISHED" });
  });

  it("si otra ejecución ganó el claim (count 0), NO publica", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeReq());
    const body = await res.json();

    expect(publishToMetricool).not.toHaveBeenCalled();
    expect(body.published).toBe(0);
    expect(body.claimedByOther).toBe(1);
  });

  it("dos ejecuciones solapadas publican el post UNA sola vez", async () => {
    // La BD solo puede conceder el claim a una: la primera obtiene count 1, la
    // segunda ya no encuentra la fila en SCHEDULED.
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await POST(makeReq());
    await POST(makeReq());

    expect(publishToMetricool).toHaveBeenCalledTimes(1);
  });

  it("si Metricool devuelve error, corrige el claim a FAILED y limpia publishedAt", async () => {
    publishToMetricool.mockResolvedValue({ ok: false, error: "token caducado" });

    const res = await POST(makeReq());
    const body = await res.json();

    const [args] = update.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data).toMatchObject({ status: "FAILED", publishedAt: null });
    expect(body.failed).toBe(1);
    expect(body.published).toBe(0);
  });

  it("el camino feliz deja la pieza PUBLISHED y anota la respuesta del canal", async () => {
    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.published).toBe(1);
    expect(body.failed).toBe(0);
    const [args] = update.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data).toHaveProperty("channelResponse");
    // No vuelve a tocar status: ya lo puso el claim.
    expect(args.data).not.toHaveProperty("status");
  });

  it("un canal no publicable pasa a APPROVED sin llamar a la red", async () => {
    findMany.mockResolvedValue([piece("piece_email", "EMAIL")]);

    await POST(makeReq());

    expect(publishToMetricool).not.toHaveBeenCalled();
    const [args] = updateMany.mock.calls[0] as [{ where: Record<string, unknown>; data: Record<string, unknown> }];
    // También condicionado a SCHEDULED: si otro ya la movió, no la pisamos.
    expect(args.where).toMatchObject({ status: "SCHEDULED" });
    expect(args.data).toMatchObject({ status: "APPROVED" });
  });

  it("corre bajo el cron-lock, con TTL menor que la cadencia del cron", async () => {
    await POST(makeReq());

    expect(withCronLock).toHaveBeenCalledTimes(1);
    const [key, , ttl] = withCronLock.mock.calls[0] as [string, unknown, number | undefined];
    expect(key).toBe("publish-scheduled");
    if (ttl !== undefined) {
      expect(ttl).toBeLessThan(5 * 60 * 1000); // cadencia */5
      expect(ttl).toBeGreaterThan(120 * 1000); // maxDuration
    }
  });

  it("sin piezas pendientes no toca la red ni la BD", async () => {
    findMany.mockResolvedValue([]);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.processed).toBe(0);
    expect(publishToMetricool).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rechaza sin secreto de cron", async () => {
    requireCronSecret.mockReturnValue({ ok: false, reason: "unauthorized", status: 401 });

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});
