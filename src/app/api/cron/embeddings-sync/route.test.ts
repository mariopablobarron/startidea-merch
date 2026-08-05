/**
 * Tests para POST /api/cron/embeddings-sync.
 *
 * Lo que se fija aquí es que el cron corre BAJO CERROJO. La selección de
 * candidatos es check-then-act (LEFT JOIN de productos sin embedding → bucle de
 * llamadas de PAGO a OpenRouter → upsert), así que dos ejecuciones solapadas
 * —el tick de las 05:00 UTC y un disparo manual desde /admin/system/crons— leen
 * el mismo lote y pagan el mismo embedding dos veces. El `@unique` de
 * ProductEmbedding.productId deduplica el RESULTADO, no el TRABAJO.
 *
 * A diferencia de otros tests de cron, aquí NO se mockea `withCronLock`: se usa
 * el real contra un AdminSetting falso con semántica de clave única, que es
 * justo lo que hace atómico al lock en la BD. Así el test prueba el invariante
 * completo ("se paga una vez") y no solo que se llamó a una función.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryRaw = vi.fn();
const findUnique = vi.fn();
const upsert = vi.fn();
const generateEmbedding = vi.fn();
const requireCronSecret = vi.fn();

/** AdminSetting en memoria con la unicidad de `key` que da atomicidad al lock. */
let settings: Map<string, number>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    product: { findUnique: (...a: unknown[]) => findUnique(...a) },
    productEmbedding: { upsert: (...a: unknown[]) => upsert(...a) },
    adminSetting: {
      // Ojo: comprobación e inserción SÍNCRONAS antes de devolver la promesa.
      // Es lo que modela el índice único de Postgres; si se hiciera tras un
      // await, dos ejecuciones concurrentes ganarían las dos y el test mentiría.
      create: ({ data }: { data: { key: string; value: number } }) => {
        if (settings.has(data.key)) return Promise.reject(new Error("unique constraint"));
        settings.set(data.key, data.value);
        return Promise.resolve(data);
      },
      findUnique: ({ where }: { where: { key: string } }) =>
        Promise.resolve(settings.has(where.key) ? { value: settings.get(where.key) } : null),
      updateMany: ({ where, data }: { where: { key: string; value: { equals: number } }; data: { value: number } }) => {
        if (settings.get(where.key) !== where.value.equals) return Promise.resolve({ count: 0 });
        settings.set(where.key, data.value);
        return Promise.resolve({ count: 1 });
      },
      delete: ({ where }: { where: { key: string } }) => {
        settings.delete(where.key);
        return Promise.resolve({});
      },
    },
  },
}));

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: (...a: unknown[]) => generateEmbedding(...a),
  embeddingTextForProduct: (p: { name: string }) => `texto de ${p.name}`,
}));

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));

vi.mock("@/lib/cron-tracking", () => ({
  // Passthrough: la telemetría no es lo que se prueba aquí.
  wrapCronHandler: (_name: string, handler: (req: Request) => Promise<Response>) => handler,
}));

import { POST } from "./route";

function makeReq(batch?: number): Request {
  const qs = batch ? `?batch=${batch}` : "";
  return new Request(`https://test/api/cron/embeddings-sync${qs}`, {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings = new Map();
  requireCronSecret.mockReturnValue({ ok: true });
  queryRaw.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
  findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve({ id: where.id, name: `Producto ${where.id}`, category: null }),
  );
  // Llamada de PAGO: un tick de event loop para que dos ejecuciones puedan
  // solaparse de verdad dentro del bucle.
  generateEmbedding.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 0));
    return [0.1, 0.2, 0.3];
  });
  upsert.mockResolvedValue({});
});

describe("embeddings-sync · cerrojo contra gasto duplicado de LLM", () => {
  it("dos ejecuciones solapadas generan los embeddings UNA sola vez", async () => {
    const [a, b] = await Promise.all([POST(makeReq()), POST(makeReq())]);
    const bodies = [await a.json(), await b.json()];

    // 2 candidatos × 1 ejecución = 2 llamadas de pago, no 4.
    expect(generateEmbedding).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    // Una hace el trabajo, la otra sale por el lock.
    expect(bodies.filter((x) => x.skipped)).toHaveLength(1);
    expect(bodies.filter((x) => x.processed === 2)).toHaveLength(1);
  });

  it("la ejecución que se salta NO toca la BD ni el proveedor", async () => {
    // Lock ya tomado por otra ejecución viva.
    settings.set("cron_lock:embeddings-sync", Date.now());

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.skipped).toContain("embeddings-sync");
    expect(queryRaw).not.toHaveBeenCalled();
    expect(generateEmbedding).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("libera el lock al terminar, para que el tick siguiente pueda correr", async () => {
    await POST(makeReq());
    expect(settings.has("cron_lock:embeddings-sync")).toBe(false);

    await POST(makeReq());
    expect(generateEmbedding).toHaveBeenCalledTimes(4); // 2 + 2, en serie sí se repite
  });

  it("libera el lock aunque la ejecución reviente", async () => {
    generateEmbedding.mockRejectedValue(new Error("OpenRouter caído"));

    await expect(POST(makeReq())).rejects.toThrow("OpenRouter caído");

    expect(settings.has("cron_lock:embeddings-sync")).toBe(false);
  });

  it("un lock caducado (run muerto) no bloquea para siempre", async () => {
    // TTL 15 min → 20 min atrás está caducado.
    settings.set("cron_lock:embeddings-sync", Date.now() - 20 * 60 * 1000);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.skipped).toBeUndefined();
    expect(body.processed).toBe(2);
  });

  it("un lock vivo pero antiguo (menos del TTL) SÍ bloquea", async () => {
    // 10 min < TTL 15 min: el run anterior puede seguir vivo (maxDuration 600 s).
    settings.set("cron_lock:embeddings-sync", Date.now() - 10 * 60 * 1000);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.skipped).toContain("embeddings-sync");
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("un embedding que falla no se cuenta como procesado ni se guarda", async () => {
    generateEmbedding.mockResolvedValue(null);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.processed).toBe(0);
    expect(body.failed).toBe(2);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rechaza sin secreto de cron y ni siquiera pide el lock", async () => {
    requireCronSecret.mockReturnValue({ ok: false, reason: "unauthorized", status: 401 });

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(settings.size).toBe(0);
  });
});
