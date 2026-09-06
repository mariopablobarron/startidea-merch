/**
 * Tests de `auditarPrecios`.
 *
 * Se prueba con un Prisma de mentira porque lo que importa no es la SQL sino
 * lo que la función hace con lo que le devuelve: los recuentos, que el precio
 * publicado salga de `clientFromPriceCents` y no de una fórmula propia, y las
 * conversiones de BigInt que, si faltan, revientan solo en producción.
 */
import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { auditarPrecios, SUPPLIERS } from "./auditoria-precios";
import { clientFromPriceCents } from "./product-pricing";

/**
 * Prisma de mentira. `count` y `findMany` responden según el filtro para
 * poder distinguir las tres consultas que hace la función por proveedor.
 */
function prismaFalso(over: {
  sinPrecio?: number;
  sinTarifa?: number;
  ejemplosSinTarifa?: {
    slug: string;
    name: string;
    fromPriceCents: number;
    override: { customFromPriceCents: number | null; marginPct: number | null; marketingTags: string[] } | null;
  }[];
  filasHorquilla?: Array<{
    slug: string;
    name: string;
    min_cents: number;
    max_cents: number;
    variantes: bigint;
    total: bigint;
  }>;
  conTarifa?: {
    slug: string;
    fromPriceCents: number;
    override: { customFromPriceCents: number | null; marginPct: number | null; marketingTags: string[] } | null;
  }[];
} = {}) {
  const {
    sinPrecio = 0,
    sinTarifa = 0,
    ejemplosSinTarifa = [],
    filasHorquilla = [],
    conTarifa = [],
  } = over;
  return {
    product: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.OR) return sinPrecio; // A
        if (where.variants && "none" in (where.variants as object)) return sinTarifa; // B
        return 0; // adivin activos
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.variants && "none" in (where.variants as object)) return ejemplosSinTarifa; // B
        return conTarifa; // E
      }),
    },
    productOverride: { count: vi.fn(async () => 0) },
    $queryRaw: vi.fn(async () => filasHorquilla),
  } as unknown as PrismaClient;
}

describe("auditarPrecios", () => {
  it("suma los recuentos de los cuatro proveedores", async () => {
    const a = await auditarPrecios(prismaFalso({ sinPrecio: 3, sinTarifa: 5 }));
    expect(a.sinPrecio.total).toBe(3 * SUPPLIERS.length);
    expect(a.sinTarifa.total).toBe(5 * SUPPLIERS.length);
    for (const s of SUPPLIERS) expect(a.sinPrecio.porProveedor[s]).toBe(3);
  });

  it("el «desde» de la sección B sale de clientFromPriceCents, no de una fórmula propia", async () => {
    const a = await auditarPrecios(
      prismaFalso({
        sinTarifa: 1,
        ejemplosSinTarifa: [
          { slug: "taza", name: "Taza", fromPriceCents: 1000, override: null },
        ],
      }),
    );
    const p = a.sinTarifa.ejemplos.midocean[0];
    expect(p.costeCents).toBe(1000);
    expect(p.desdeCents).toBe(clientFromPriceCents(1000, null));
  });

  it("y respeta el margen fijado por el panel, que antes se ignoraba", async () => {
    // Con `marginPct` el precio publicado NO es el del multiplicador global.
    // La primera versión usaba `applyMargin` a secas y enseñaba un «desde»
    // que no era el que ve el cliente.
    const override = { customFromPriceCents: null, marginPct: 10, marketingTags: [] };
    const a = await auditarPrecios(
      prismaFalso({
        sinTarifa: 1,
        ejemplosSinTarifa: [{ slug: "taza", name: "Taza", fromPriceCents: 1000, override }],
      }),
    );
    const p = a.sinTarifa.ejemplos.midocean[0];
    expect(p.desdeCents).toBe(1100);
    expect(p.desdeCents).not.toBe(clientFromPriceCents(1000, null));
  });

  it("el COUNT(*) de Postgres llega como BigInt y sale como número", async () => {
    // `JSON.stringify` lanza «Do not know how to serialize a BigInt», así que
    // sin esta conversión la página del panel devolvería un 500 en cuanto
    // hubiera un solo producto con variantes de precios distintos.
    const a = await auditarPrecios(
      prismaFalso({
        filasHorquilla: [
          { slug: "polo", name: "Polo", min_cents: 500, max_cents: 800, variantes: 7n, total: 3n },
        ],
      }),
    );
    const f = a.horquillaVariantes.ejemplos.cifra[0];
    expect(typeof f.variantes).toBe("number");
    expect(f.variantes).toBe(7);
    expect(f.saltoPct).toBeCloseTo(60, 5);
    // El total viene de `COUNT(*) OVER ()`, también BigInt, y no es el número
    // de filas devueltas: la consulta lleva LIMIT.
    expect(a.horquillaVariantes.porProveedor.cifra).toBe(3);
    expect(() => JSON.stringify(a)).not.toThrow();
  });

  it("sin productos con tarifa real, el margen medio es null y no NaN", async () => {
    // Dividir entre cero daba NaN, que en JSON viaja como `null` de todas
    // formas pero pasando antes por una media sin sentido. Se decide aquí.
    const a = await auditarPrecios(prismaFalso({ conTarifa: [] }));
    for (const s of SUPPLIERS) {
      expect(a.margenEfectivo[s].muestra).toBe(0);
      expect(a.margenEfectivo[s].margenMedioPct).toBeNull();
    }
  });

  it("el margen efectivo incluye los que llevan override, que son los que se desvían", async () => {
    // La primera versión los excluía del cálculo, así que la media solo podía
    // dar el porcentaje configurado: el número de entrada, devuelto. Con un
    // override del 10 % sobre coste el margen real es 9,1 %, no el 40 %.
    const a = await auditarPrecios(
      prismaFalso({
        conTarifa: [
          { slug: "normal", fromPriceCents: 1000, override: null },
          {
            slug: "regalado",
            fromPriceCents: 1000,
            override: { customFromPriceCents: null, marginPct: 10, marketingTags: [] },
          },
        ],
      }),
    );
    const m = a.margenEfectivo.makito;
    expect(m.muestra).toBe(2);
    expect(m.conPrecioFijado).toBe(1);
    // Media de ~40 % y ~9,1 %: ni uno ni otro, que es la prueba de que ya no
    // es una tautología.
    expect(m.margenMedioPct!).toBeGreaterThan(20);
    expect(m.margenMedioPct!).toBeLessThan(30);
  });

  it("y señala con el dedo los que se quedan por debajo del umbral", async () => {
    const a = await auditarPrecios(
      prismaFalso({
        conTarifa: [
          { slug: "normal", fromPriceCents: 1000, override: null },
          {
            slug: "regalado",
            fromPriceCents: 1000,
            override: { customFromPriceCents: null, marginPct: 10, marketingTags: [] },
          },
        ],
      }),
    );
    const m = a.margenEfectivo.makito;
    expect(m.flojos.map((f) => f.slug)).toEqual(["regalado"]);
    expect(m.flojos[0].margenPct).toBeCloseTo(9.09, 1);
    expect(m.flojos[0].desdeCents).toBe(1100);
  });

  it("no escribe nada: el Prisma de mentira no tiene ni update ni create", async () => {
    // El contrato de esta función es que se puede lanzar contra producción.
    // Si alguien le añade una escritura, este test revienta con «is not a
    // function» en vez de descubrirse el día que se ejecute de verdad.
    await expect(auditarPrecios(prismaFalso())).resolves.toBeTruthy();
  });
});
