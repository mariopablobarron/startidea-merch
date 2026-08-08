/**
 * Tests para GET /api/health.
 *
 * El health lo consume el watchdog externo, el healthcheck de Docker y el
 * propio `scripts/deploy.sh`. Lo que se fija aquí es el contrato mínimo del que
 * dependen: el 200/503 según Postgres y el `sha` del commit vivo, que es la
 * única vía de verificar un deploy cuando el SSH a la VPS no responde.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) },
}));

vi.mock("@/lib/embeddings", () => ({ warmEmbeddingCache: vi.fn() }));

import { GET } from "./route";

const originalSha = process.env.GIT_SHA;

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([{ "?column?": 1 }]);
});

afterEach(() => {
  if (originalSha === undefined) delete process.env.GIT_SHA;
  else process.env.GIT_SHA = originalSha;
});

describe("GET /api/health", () => {
  it("devuelve 200 y el sha corto del commit vivo cuando la BD responde", async () => {
    process.env.GIT_SHA = "63baa46b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f";

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.db).toBe("ok");
    // 7 caracteres: el mismo formato que `git rev-parse --short`, para poder
    // comparar de un vistazo contra origin/main.
    expect(body.sha).toBe("63baa46");
  });

  it("sin GIT_SHA en el entorno devuelve null, no cadena vacía", async () => {
    delete process.env.GIT_SHA;

    const body = await (await GET()).json();

    expect(body.sha).toBeNull();
  });

  it("devuelve 503 con el motivo si Postgres no responde", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.db).toContain("connection refused");
  });

  it("no se cachea: el watchdog tiene que ver el estado de AHORA", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
