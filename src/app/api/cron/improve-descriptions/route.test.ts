/**
 * Tests para POST /api/cron/improve-descriptions.
 *
 * Mismo problema que embeddings-sync, y aquí peor: la selección es
 * check-then-act (lee los N productos con `enhancedShortDescription: null` →
 * bucle de llamadas de PAGO a OpenRouter → escribe uno a uno), y NO existe
 * ninguna dedup de resultado que salve la factura — dos ejecuciones solapadas
 * leen el mismo lote todavía sin escribir, pagan el mismo texto dos veces y
 * además se pisan la escritura.
 *
 * Como en embeddings-sync, aquí se usa el `withCronLock` REAL contra un
 * AdminSetting falso con semántica de clave única: lo que se prueba es que se
 * paga una sola vez, no que se llamó a una función.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findMany = vi.fn();
const update = vi.fn();
const count = vi.fn();
const requireCronSecret = vi.fn();

/** AdminSetting en memoria con la unicidad de `key` que da atomicidad al lock. */
let settings: Map<string, number>;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: (...a: unknown[]) => findMany(...a),
      update: (...a: unknown[]) => update(...a),
      count: (...a: unknown[]) => count(...a),
    },
    adminSetting: {
      // Comprobación e inserción SÍNCRONAS: modela el índice único de Postgres.
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

vi.mock("@/lib/auth", () => ({
  requireCronSecret: (...a: unknown[]) => requireCronSecret(...a),
}));

vi.mock("@/lib/cron-tracking", () => ({
  wrapCronHandler: (_name: string, handler: (req: Request) => Promise<Response>) => handler,
}));

// La clave se lee al IMPORTAR el módulo de la ruta (const de nivel superior), y
// los `import` se elevan por encima de cualquier asignación suelta → hay que
// ponerla en un bloque hoisted o la ruta arranca sin clave y responde 503.
vi.hoisted(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
});

import { POST } from "./route";

/** Llamadas de PAGO a OpenRouter. */
let llmCalls: number;

function makeReq(): Request {
  return new Request("https://test/api/cron/improve-descriptions", {
    method: "POST",
    headers: { "x-cron-secret": "secret" },
  });
}

function product(id: string) {
  return {
    id,
    slug: `slug-${id}`,
    name: `Producto ${id}`,
    brand: null,
    shortDescription: "20x30 cm",
    longDescription: null,
    material: "algodón",
    category: null,
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  settings = new Map();
  llmCalls = 0;
  requireCronSecret.mockReturnValue({ ok: true });
  findMany.mockResolvedValue([product("p1"), product("p2")]);
  update.mockResolvedValue({});
  globalThis.fetch = vi.fn(async () => {
    llmCalls++;
    await new Promise((r) => setTimeout(r, 0));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "Bolsa de algodón resistente. Ideal para ferias." } }],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("improve-descriptions · cerrojo contra gasto duplicado de LLM", () => {
  it("dos ejecuciones solapadas llaman al LLM UNA sola vez por producto", async () => {
    const [a, b] = await Promise.all([POST(makeReq()), POST(makeReq())]);
    const bodies = [await a.json(), await b.json()];

    // 2 productos × 1 ejecución = 2 llamadas de pago, no 4.
    expect(llmCalls).toBe(2);
    expect(update).toHaveBeenCalledTimes(2);
    expect(bodies.filter((x) => x.skipped)).toHaveLength(1);
    expect(bodies.filter((x) => x.updated === 2)).toHaveLength(1);
  });

  it("la ejecución que se salta NO lee candidatos ni llama al LLM", async () => {
    settings.set("cron_lock:improve-descriptions", Date.now());

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.skipped).toContain("improve-descriptions");
    expect(findMany).not.toHaveBeenCalled();
    expect(llmCalls).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("libera el lock al terminar", async () => {
    await POST(makeReq());
    expect(settings.has("cron_lock:improve-descriptions")).toBe(false);
  });

  it("un lock caducado (run muerto) no bloquea para siempre", async () => {
    // TTL 15 min → 20 min atrás está caducado.
    settings.set("cron_lock:improve-descriptions", Date.now() - 20 * 60 * 1000);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.skipped).toBeUndefined();
    expect(body.updated).toBe(2);
  });

  it("un lock vivo pero antiguo (menos del TTL) SÍ bloquea", async () => {
    settings.set("cron_lock:improve-descriptions", Date.now() - 10 * 60 * 1000);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.skipped).toContain("improve-descriptions");
    expect(llmCalls).toBe(0);
  });

  it("sin candidatos no llama al LLM, y suelta el lock igual", async () => {
    findMany.mockResolvedValue([]);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.processed).toBe(0);
    expect(llmCalls).toBe(0);
    expect(settings.has("cron_lock:improve-descriptions")).toBe(false);
  });

  it("un producto que falla no tumba el lote ni deja el lock puesto", async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      llmCalls++;
      n++;
      if (n === 1) return new Response("rate limited", { status: 429 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Bolsa resistente. Ideal para ferias." } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const res = await POST(makeReq());
    const body = await res.json();

    expect(body.updated).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(settings.has("cron_lock:improve-descriptions")).toBe(false);
  });

  it("rechaza sin secreto de cron y ni siquiera pide el lock", async () => {
    requireCronSecret.mockReturnValue({ ok: false, reason: "unauthorized", status: 401 });

    const res = await POST(makeReq());

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(settings.size).toBe(0);
  });
});
