/**
 * Tests para GET /api/health.
 *
 * El health lo consume el watchdog externo, el healthcheck de Docker y el
 * propio `scripts/deploy.sh`. Lo que se fija aquí es el contrato mínimo del que
 * dependen: el 200/503 según Postgres y el `sha` del commit vivo, que es la
 * única vía de verificar un deploy cuando el SSH a la VPS no responde.
 *
 * Y por ese mismo motivo, la carga del anfitrión — pero esa va gateada por el
 * secret de cron, así que aquí lo que se fija sobre todo es que la puerta esté
 * CERRADA por defecto: el watchdog llama sin secret y romperle la respuesta se
 * vería como una caída falsa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) },
}));

vi.mock("@/lib/embeddings", () => ({ warmEmbeddingCache: vi.fn() }));

import { GET } from "./route";

const originalSha = process.env.GIT_SHA;
const originalCronSecret = process.env.CRON_SECRET;
const CRON_SECRET = "secreto-de-prueba-suficientemente-largo";

const url = "https://merchandising.startidea.es/api/health";

/** El handler pide una Request (la necesita para leer el secret). */
function pide(headers: Record<string, string> = {}) {
  return GET(new Request(url, { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([{ "?column?": 1 }]);
});

afterEach(() => {
  if (originalSha === undefined) delete process.env.GIT_SHA;
  else process.env.GIT_SHA = originalSha;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe("GET /api/health", () => {
  it("devuelve 200 y el sha corto del commit vivo cuando la BD responde", async () => {
    process.env.GIT_SHA = "63baa46b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f";

    const res = await pide();
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

    const body = await (await pide()).json();

    expect(body.sha).toBeNull();
  });

  it("devuelve 503 con el motivo si Postgres no responde", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await pide();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.db).toContain("connection refused");
  });

  it("no se cachea: el watchdog tiene que ver el estado de AHORA", async () => {
    const res = await pide();
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("GET /api/health — carga del anfitrión", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  it("sin secret no la expone, y la respuesta pública sigue intacta", async () => {
    const res = await pide();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.host).toBeUndefined();
    // Lo que el watchdog y el verificador de deploys sí necesitan:
    expect(body.ok).toBe(true);
    expect(body.checks.db).toBe("ok");
    expect(JSON.stringify(body)).not.toContain("load1");
  });

  it("con un secret equivocado tampoco la expone", async () => {
    const res = await pide({ "x-cron-secret": "no-es-el-secreto" });

    expect(res.status).toBe(200);
    expect((await res.json()).host).toBeUndefined();
  });

  it("con el secret correcto devuelve load1/5/15 y los cores", async () => {
    const body = await (await pide({ "x-cron-secret": CRON_SECRET })).json();

    for (const k of ["load1", "load5", "load15"]) {
      expect(typeof body.host[k]).toBe("number");
      expect(Number.isFinite(body.host[k])).toBe(true);
      expect(body.host[k]).toBeGreaterThanOrEqual(0);
    }
    // Sin los cores un load1 suelto no se puede interpretar: 8 en un KVM8 es
    // pleno empleo y en un KVM2 es un incendio.
    expect(body.host.cpus).toBeGreaterThan(0);
  });

  it("si el anfitrión no tiene CRON_SECRET configurado, no hay puerta que abrir", async () => {
    delete process.env.CRON_SECRET;

    const body = await (await pide({ "x-cron-secret": CRON_SECRET })).json();

    expect(body.host).toBeUndefined();
  });
});
