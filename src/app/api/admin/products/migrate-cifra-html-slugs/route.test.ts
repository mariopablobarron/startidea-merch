import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXPECTED_CIFRA_HTML_OLD_SLUGS } from "@/lib/cifra-html-slug-migration";

type ProductRow = {
  id: string;
  supplier: string;
  supplierRef: string;
  internalRef: string | null;
  active: boolean;
  name: string;
  slug: string;
};
type RedirectRow = { oldSlug: string; productId: string | null };
type SettingRow = { key: string; value: unknown };
type AnalyticsRow = {
  id: string;
  type: string;
  path: string | null;
  productSlug: string | null;
  payload: unknown;
};
type ScalarSlugRow = { id: string; productSlug: string | null };
type SlugListRow = { id: string; slugs: string[] };
type DbState = {
  products: ProductRow[];
  redirects: RedirectRow[];
  settings: SettingRow[];
  analyticsEvents: AnalyticsRow[];
  cartQuoteItems: ScalarSlugRow[];
  orderProofs: ScalarSlugRow[];
  contentPieces: ScalarSlugRow[];
  portfolioItems: ScalarSlugRow[];
  voiceSessions: SlugListRow[];
  recommenderQueries: SlugListRow[];
};

const mocks = vi.hoisted(() => ({
  state: {
    products: [],
    redirects: [],
    settings: [],
    analyticsEvents: [],
    cartQuoteItems: [],
    orderProofs: [],
    contentPieces: [],
    portfolioItems: [],
    voiceSessions: [],
    recommenderQueries: [],
  } as DbState,
  lock: vi.fn(),
  unlock: vi.fn(),
  reindex: vi.fn(),
  revalidate: vi.fn(),
  failUpdateFor: null as string | null,
}));

function cloneState(state: DbState): DbState {
  return structuredClone(state);
}

function scalarSlugModel(rows: ScalarSlugRow[]) {
  return {
    updateManyAndReturn: vi.fn(async ({ where, data }: { where: { productSlug: string }; data: { productSlug: string } }) => {
      const updated: Array<{ id: string }> = [];
      for (const row of rows) {
        if (row.productSlug !== where.productSlug) continue;
        row.productSlug = data.productSlug;
        updated.push({ id: row.id });
      }
      return updated;
    }),
  };
}

function slugListModel(rows: SlugListRow[], field: "productSlugsDiscussed" | "recommendedSlugs") {
  return {
    findMany: vi.fn(async ({ where }: { where: Record<string, { hasSome: string[] }> }) => {
      const oldSlugs = new Set(where[field].hasSome);
      return rows
        .filter((row) => row.slugs.some((slug) => oldSlugs.has(slug)))
        .map((row) => ({ id: row.id, [field]: [...row.slugs] }));
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, string[]> }) => {
      const row = rows.find((item) => item.id === where.id);
      if (!row) throw new Error("missing slug list row");
      row.slugs = [...data[field]];
      return row;
    }),
  };
}

function makeDb(state: DbState) {
  return {
    product: {
      findMany: vi.fn(async () => cloneState(state).products),
      findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) => {
        const row = state.products.find((item) =>
          where.id ? item.id === where.id : item.slug === where.slug,
        );
        return row ? { ...row } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; slug: string }; data: { slug: string } }) => {
        if (mocks.failUpdateFor === where.id) throw new Error("fallo inyectado");
        const row = state.products.find((item) => item.id === where.id && item.slug === where.slug);
        if (!row) return { count: 0 };
        row.slug = data.slug;
        return { count: 1 };
      }),
    },
    productSlugRedirect: {
      findMany: vi.fn(async () => state.redirects.map(({ oldSlug }) => ({ oldSlug }))),
      findUnique: vi.fn(async ({ where }: { where: { oldSlug: string } }) => {
        const row = state.redirects.find((item) => item.oldSlug === where.oldSlug);
        return row ? { ...row } : null;
      }),
      create: vi.fn(async ({ data }: { data: RedirectRow }) => {
        if (state.redirects.some((item) => item.oldSlug === data.oldSlug)) throw new Error("P2002");
        state.redirects.push({ ...data });
        return data;
      }),
    },
    adminSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const row = state.settings.find((item) => item.key === where.key);
        return row ? { value: row.value } : null;
      }),
      create: vi.fn(async ({ data }: { data: SettingRow }) => {
        if (state.settings.some((item) => item.key === data.key)) throw new Error("P2002");
        state.settings.push(structuredClone(data));
        return data;
      }),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown } }) => {
        const row = state.settings.find((item) => item.key === where.key);
        if (!row) throw new Error("missing setting");
        row.value = structuredClone(data.value);
        return row;
      }),
    },
    analyticsEvent: {
      updateManyAndReturn: vi.fn(async ({ where, data }: { where: { productSlug: string }; data: { productSlug: string } }) => {
        const updated: Array<{ id: string }> = [];
        for (const row of state.analyticsEvents) {
          if (row.productSlug !== where.productSlug) continue;
          row.productSlug = data.productSlug;
          updated.push({ id: row.id });
        }
        return updated;
      }),
    },
    cartQuoteItem: scalarSlugModel(state.cartQuoteItems),
    orderProof: scalarSlugModel(state.orderProofs),
    contentPiece: scalarSlugModel(state.contentPieces),
    portfolioItem: scalarSlugModel(state.portfolioItems),
    voiceSession: slugListModel(state.voiceSessions, "productSlugsDiscussed"),
    recommenderQuery: slugListModel(state.recommenderQueries, "recommendedSlugs"),
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    get product() { return makeDb(mocks.state).product; },
    get productSlugRedirect() { return makeDb(mocks.state).productSlugRedirect; },
    get adminSetting() { return makeDb(mocks.state).adminSetting; },
    get analyticsEvent() { return makeDb(mocks.state).analyticsEvent; },
    get cartQuoteItem() { return makeDb(mocks.state).cartQuoteItem; },
    get orderProof() { return makeDb(mocks.state).orderProof; },
    get contentPiece() { return makeDb(mocks.state).contentPiece; },
    get portfolioItem() { return makeDb(mocks.state).portfolioItem; },
    get voiceSession() { return makeDb(mocks.state).voiceSession; },
    get recommenderQuery() { return makeDb(mocks.state).recommenderQuery; },
    $transaction: vi.fn(async (fn: (tx: ReturnType<typeof makeDb>) => Promise<unknown>) => {
      const pending = cloneState(mocks.state);
      const result = await fn(makeDb(pending));
      mocks.state = pending;
      return result;
    }),
  },
}));
vi.mock("@/lib/admin-auth", () => ({
  requireRole: async () => ({
    ok: true,
    session: { userId: "test", email: "ops@startidea.es", name: "Ops", role: "OPERACIONES" },
  }),
}));
vi.mock("@/lib/cron-lock", () => ({
  acquireCronLockLease: (...args: unknown[]) => mocks.lock(...args),
  releaseCronLockLease: (...args: unknown[]) => mocks.unlock(...args),
}));
vi.mock("@/lib/search/meili", () => ({
  meiliEnabled: () => true,
  reindexAllProducts: (...args: unknown[]) => mocks.reindex(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => mocks.revalidate(...args) }));

import { GET, POST } from "./route";
import { prisma as prismaMock } from "@/lib/prisma";

const NAMES: Record<(typeof EXPECTED_CIFRA_HTML_OLD_SLUGS)[number], string> = {
  "pbalon-de-reglamento": "<p>BALÓN DE REGLAMENTO",
  "pboligrafo-guardia-civil-tricorniop": "<p>BOLIGRAFO GUARDIA CIVIL “TRICORNIO”</p>",
  "pboligrafo-policia-local-fortep": "<p>BOLIGRAFO POLICIA LOCAL “FORTE”</p>",
  "pbolsa-fieltro-para-vino": "<p>BOLSA FIELTRO PARA VINO",
  "pcartera-monedero-barlettap": "<p>CARTERA MONEDERO “BARLETTA”</p>",
  "pcubo-antiestres-bloquep": "<p>CUBO ANTIESTRÉS “BLOQUE”</p>",
  "pdoctora-antiestres-galenap": "<p>DOCTORA ANTIESTRÉS “GALENA”</p>",
  "pgafas-de-sol": "<p>GAFAS DE SOL",
  "pjuego-de-habilidad": "<p>JUEGO DE HABILIDAD",
  "pllavero-diplomadop": "<p>LLAVERO “DIPLOMADO”</p>",
  "pmug-sublimacion-250-ml-blanca": "<p>MUG SUBLIMACION 250 ML BLANCA",
  "psecador-ionico-bldc-8-piezas-pierre-cardin-milanop": "<p>SECADOR IÓNICO BLDC 8 PIEZAS PIERRE CARDIN “MILANO”</p>",
  "pset-de-gomas": "<p>SET DE GOMAS",
  "ptrofeo-deportivo-golp": "<p>TROFEO DEPORTIVO “GOL”</p>",
  "ptrofeo-deportivo-pivotp": "<p>TROFEO DEPORTIVO “PIVOT”</p>",
  "ptrofeo-deportivo-smashp": "<p>TROFEO DEPORTIVO “SMASH”</p>",
  "ptrofeo-orion-sublimacionp": "<p>TROFEO “ORIÓN” SUBLIMACION</p>",
};

function auditedState(): DbState {
  const affected = EXPECTED_CIFRA_HTML_OLD_SLUGS.map((slug, index) => ({
    id: `cifra-${index}`,
    supplier: "cifra",
    supplierRef: `REF-${String(index).padStart(2, "0")}`,
    internalRef: `STM-${index}`,
    active: true,
    name: NAMES[slug],
    slug,
  }));
  return {
    products: [
      ...affected,
      { id: "g1", supplier: "midocean", supplierRef: "G1", internalRef: null, active: true, name: "GAFAS DE SOL", slug: "gafas-de-sol" },
      { id: "g2", supplier: "makito", supplierRef: "G2", internalRef: null, active: true, name: "GAFAS DE SOL", slug: "gafas-de-sol-2" },
    ],
    redirects: [],
    settings: [],
    analyticsEvents: [
      { id: "event-1", type: "pageview", path: "/catalogo/pbalon-de-reglamento", productSlug: "pbalon-de-reglamento", payload: {} },
      { id: "event-2", type: "pageview", path: "/catalogo/pbalon-de-reglamento", productSlug: "pbalon-de-reglamento", payload: {} },
    ],
    cartQuoteItems: [{ id: "cart-item", productSlug: "pbalon-de-reglamento" }],
    orderProofs: [{ id: "proof", productSlug: "pgafas-de-sol" }],
    contentPieces: [{ id: "content", productSlug: "pset-de-gomas" }],
    portfolioItems: [{ id: "portfolio", productSlug: "ptrofeo-deportivo-pivotp" }],
    voiceSessions: [{ id: "voice", slugs: ["pgafas-de-sol", "ajeno", "pgafas-de-sol"] }],
    recommenderQueries: [{ id: "recommend", slugs: ["pbalon-de-reglamento", "ajeno"] }],
  };
}

function request(method: "GET" | "POST") {
  return new Request("https://example.test/api/admin/products/migrate-cifra-html-slugs", { method });
}

beforeEach(() => {
  mocks.state = auditedState();
  mocks.lock.mockReset().mockResolvedValue("lease-test");
  mocks.unlock.mockReset().mockResolvedValue(undefined);
  mocks.reindex.mockReset().mockResolvedValue({ indexed: 9591 });
  mocks.revalidate.mockReset();
  mocks.failUpdateFor = null;
  vi.mocked(prismaMock.$transaction).mockClear();
});

describe("migrate-cifra-html-slugs", () => {
  it("GET entrega el dry-run exacto sin escribir", async () => {
    const response = await GET(request("GET"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ dryRun: true, expectedAffected: 17, affected: 17, safeToApply: true });
    expect(body.preview.find((item: { oldSlug: string }) => item.oldSlug === "pgafas-de-sol").newSlug).toBe("gafas-de-sol-3");
    expect(mocks.state.redirects).toHaveLength(0);
  });

  it("POST migra los 17 en una transacción, guarda manifest y reindexa", async () => {
    const response = await POST(request("POST"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, affected: 17, alreadyApplied: false });
    expect(mocks.state.redirects).toHaveLength(17);
    expect(mocks.state.products.find((item) => item.id === "cifra-7")?.slug).toBe("gafas-de-sol-3");
    expect(mocks.state.settings).toHaveLength(1);
    expect(body.manifest).toMatchObject({ status: "COMPLETED", appliedBy: "ops@startidea.es" });
    expect(body.manifest.referenceUpdates.analyticsEvents).toEqual([
      { id: "event-1", oldSlug: "pbalon-de-reglamento", newSlug: "balon-de-reglamento" },
      { id: "event-2", oldSlug: "pbalon-de-reglamento", newSlug: "balon-de-reglamento" },
    ]);
    expect(body.manifest.referenceUpdates.cartQuoteItems).toHaveLength(1);
    expect(body.manifest.referenceUpdates.orderProofs).toHaveLength(1);
    expect(body.manifest.referenceUpdates.contentPieces).toHaveLength(1);
    expect(body.manifest.referenceUpdates.portfolioItems).toHaveLength(1);
    expect(mocks.state.analyticsEvents).toEqual([
      { id: "event-1", type: "pageview", path: "/catalogo/pbalon-de-reglamento", productSlug: "balon-de-reglamento", payload: {} },
      { id: "event-2", type: "pageview", path: "/catalogo/pbalon-de-reglamento", productSlug: "balon-de-reglamento", payload: {} },
    ]);
    expect(mocks.state.voiceSessions[0]?.slugs).toEqual(["pgafas-de-sol", "ajeno", "pgafas-de-sol"]);
    expect(mocks.state.recommenderQueries[0]?.slugs).toEqual(["pbalon-de-reglamento", "ajeno"]);
    expect(mocks.reindex).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledWith("/catalogo/pgafas-de-sol");
    expect(mocks.revalidate).toHaveBeenCalledWith("/catalogo/gafas-de-sol-3");
    expect(mocks.unlock).toHaveBeenCalledWith("supplier-sync:cifra", "lease-test");
  });

  it("revierte toda la transacción si falla entre redirect y Product.slug", async () => {
    mocks.failUpdateFor = "cifra-3";
    const response = await POST(request("POST"));
    expect(response.status).toBe(500);
    expect(mocks.state.redirects).toHaveLength(0);
    expect(mocks.state.products.find((item) => item.id === "cifra-0")?.slug).toBe("pbalon-de-reglamento");
    expect(mocks.state.settings).toHaveLength(0);
    expect(mocks.state.analyticsEvents[0]?.productSlug).toBe("pbalon-de-reglamento");
    expect(mocks.reindex).not.toHaveBeenCalled();
    expect(mocks.unlock).toHaveBeenCalledOnce();
  });

  it("no empieza si el lock del sync Cifra está ocupado", async () => {
    mocks.lock.mockResolvedValue(false);
    const response = await POST(request("POST"));
    expect(response.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(mocks.unlock).not.toHaveBeenCalled();
  });

  it("la reejecución es idempotente", async () => {
    expect((await POST(request("POST"))).status).toBe(200);
    const redirectCount = mocks.state.redirects.length;
    const response = await POST(request("POST"));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, affected: 0, alreadyApplied: true });
    expect(mocks.state.redirects).toHaveLength(redirectCount);
  });

  it("reanuda cache y Meili si el primer post-commit terminó con avisos", async () => {
    mocks.reindex.mockRejectedValueOnce(new Error("meili temporal"));
    const first = await POST(request("POST"));
    const firstBody = await first.json();
    expect(firstBody).toMatchObject({ ok: false, alreadyApplied: false });
    expect(firstBody.manifest.status).toBe("COMPLETED_WITH_WARNINGS");

    mocks.reindex.mockResolvedValueOnce({ indexed: 9591 });
    const retry = await POST(request("POST"));
    const retryBody = await retry.json();
    expect(retryBody).toMatchObject({
      ok: true,
      affected: 0,
      alreadyApplied: true,
      resumedPostCommit: true,
    });
    expect(retryBody.manifest.status).toBe("COMPLETED");
    expect(mocks.reindex).toHaveBeenCalledTimes(2);
  });

  it("no declara éxito si no quedan candidatos pero tampoco existe manifest", async () => {
    mocks.state.products = mocks.state.products.filter((item) => !item.id.startsWith("cifra-"));
    const response = await POST(request("POST"));
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ ok: false });
    expect(body.error).toMatch(/sin manifest/i);
  });
});
