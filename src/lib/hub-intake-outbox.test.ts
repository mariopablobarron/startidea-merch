import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const updateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hubIntakeOutbox: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
    },
  },
}));

import {
  flushHubIntakeOutbox,
  HUB_INTAKE_MAX_BYTES,
  nextHubIntakeRetryAt,
  normalizeHubIntakePayload,
} from "./hub-intake-outbox";

const originalEnv = { ...process.env };

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  updateMany.mockReset();
  updateMany.mockResolvedValue({ count: 1 });
  process.env.HUB_INTAKE_SECRET = "hub-secret";
  delete process.env.HUB_INTAKE_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("hub intake outbox", () => {
  it("entrega al endpoint Merch y marca la fila", async () => {
    findMany.mockResolvedValue([{ id: "out-1" }]);
    findFirst.mockResolvedValue({
      id: "out-1", lockToken: "lease-1",
      attempts: 0,
      payload: { schemaVersion: 1, submissionId: "quote-1" },
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await flushHubIntakeOutbox({
      now: new Date("2026-08-30T12:00:00Z"),
      fetchImpl,
    });

    expect(result).toEqual({ processed: 1, delivered: 1, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hub.startidea.tech/api/public/intake/startidea-merch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer hub-secret" }),
      }),
    );
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "out-1", lockToken: expect.any(String) },
      data: expect.objectContaining({ deliveredAt: new Date("2026-08-30T12:00:00Z") }),
    }));
  });

  it("deja pendiente con backoff si HUB falla", async () => {
    findMany.mockResolvedValue([{ id: "out-2" }]);
    findFirst.mockResolvedValue({
      id: "out-2", lockToken: "lease-2",
      attempts: 2,
      payload: { schemaVersion: 1, submissionId: "quote-2" },
    });

    const result = await flushHubIntakeOutbox({
      now: new Date("2026-08-30T12:00:00Z"),
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    });

    expect(result).toEqual({ processed: 1, delivered: 0, failed: 1 });
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lastError: "HUB respondió HTTP 503",
        nextAttemptAt: new Date("2026-08-30T12:04:00Z"),
      }),
    }));
  });

  it("no llama a red ni pierde la fila cuando falta el secreto", async () => {
    delete process.env.HUB_INTAKE_SECRET;
    findMany.mockResolvedValue([{ id: "out-3" }]);
    findFirst.mockResolvedValue({
      id: "out-3", lockToken: "lease-3",
      attempts: 0,
      payload: { schemaVersion: 1, submissionId: "newsletter-event" },
    });
    const fetchImpl = vi.fn();

    const result = await flushHubIntakeOutbox({ fetchImpl });

    expect(result.failed).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: "HUB_INTAKE_SECRET no configurado" }),
    }));
  });

  it("limita el backoff a 24 horas", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    expect(nextHubIntakeRetryAt(30, now)).toEqual(new Date("2026-08-31T12:00:00Z"));
  });

  it("un lease ganado por otro proceso impide una entrega simultánea", async () => {
    findMany.mockResolvedValue([{ id: "out-race" }]);
    updateMany.mockResolvedValueOnce({ count: 0 });
    const fetchImpl = vi.fn();
    expect(await flushHubIntakeOutbox({ fetchImpl })).toEqual({ processed: 0, delivered: 0, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normaliza un payload agregado grande al contrato y a 32 KiB", () => {
    const details = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [
      ` clave-${index}-${"k".repeat(100)}`,
      Array.from({ length: 30 }, () => ` ${"á".repeat(300)} `),
    ]));
    const payload = normalizeHubIntakePayload({
      schemaVersion: 1,
      submissionId: "newsletter-event-123456",
      kind: "newsletter",
      form: "newsletter-subscribe",
      occurredAt: "2026-08-30T12:00:00+02:00",
      contact: { email: "test@example.com", name: ` ${"N".repeat(250)} ` },
      subject: ` ${"S".repeat(250)} `,
      message: ` ${"😀".repeat(6_000)} `,
      details,
    });
    expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBeLessThanOrEqual(HUB_INTAKE_MAX_BYTES);
    expect(payload.subject).toHaveLength(200);
    expect(Array.from(payload.message ?? "")).toHaveLength(5_000);
    expect(Object.keys(payload.details ?? {}).length).toBeLessThanOrEqual(40);
    for (const [key, value] of Object.entries(payload.details ?? {})) {
      expect(Array.from(key).length).toBeLessThanOrEqual(80);
      if (Array.isArray(value)) {
        expect(value.length).toBeLessThanOrEqual(20);
        expect(value.every((item) => Array.from(item).length <= 200)).toBe(true);
      }
    }
  });

  it("rechaza un submissionId inválido antes del INSERT", () => {
    expect(() => normalizeHubIntakePayload({
      schemaVersion: 1, submissionId: "mal id", kind: "other", form: "contact",
      occurredAt: new Date().toISOString(), contact: { email: "a@example.com" }, subject: "Asunto",
    })).toThrow(/submissionId/);
  });
});
