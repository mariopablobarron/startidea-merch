/**
 * Tests de `auditarPrecios`.
 *
 * Se prueba con un Prisma de mentira porque lo que importa no es la SQL sino
 * lo que la función hace con lo que le devuelve: los recuentos, la aritmética
 * del bajo coste y las dos conversiones que, si faltan, revientan solo en
 * producción.
 */
import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { auditarPrecios, SUPPLIERS } from "./auditoria-precios";
import { applyMargin } from "./pricing";

/**
 * Prisma de mentira. `count` y `findMany` responden según el filtro para
 * poder distinguir las tres consultas que hace la función por proveedor.
 */
function prismaFalso(over: {
  sinPrecio?: number;
  sinTarifa?: number;
  ejemplosSinTarifa?: { slug: string; name: string; fromPriceCents: number }[];
  filasHorquilla?: Array<{
    slug: string;
    name: string;
    min_cents: number;
    max_cents: number;
    variantes: bigint;
  }>;
  conTarifa?: { slug: string; fromPriceCents: number; override: null }[];
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

  it("marca el bajo coste con la aritmética de la curva inventada", async () => {
    // 10,00 € de coste → «desde» 16,67 € → a 250 uds el 32 % = 5,33 €, que es
    // menos de lo que cuesta. Este es el caso que motivó la tarifa plana.
    const a = await auditarPrecios(
      prismaFalso({
        sinTarifa: 1,
        ejemplosSinTarifa: [{ slug: "taza", name: "Taza", fromPriceCents: 1000 }],
      }),
    );
    const p = a.sinTarifa.ejemplos.midocean[0];
    expect(p.desdeCents).toBe(applyMargin(1000));
    expect(p.a250Cents).toBe(Math.round(applyMargin(1000) * 0.32));
    expect(p.a250Cents).toBeLessThan(p.costeCents);
    expect(p.bajoCoste).toBe(true);
    // Uno por proveedor, y los cuatro cuentan.
    expect(a.sinTarifa.bajoCoste).toBe(SUPPLIERS.length);
  });

  it("un producto barato NO se marca como bajo coste", async () => {
    // Anti-falso-verde del test anterior: si `bajoCoste` fuera siempre true,
    // esto lo caza. Con un coste de 1 céntimo el redondeo deja el tramo de
    // 250 por encima.
    const a = await auditarPrecios(
      prismaFalso({
        sinTarifa: 1,
        ejemplosSinTarifa: [{ slug: "pin", name: "Pin", fromPriceCents: 1 }],
      }),
    );
    expect(a.sinTarifa.ejemplos.midocean[0].bajoCoste).toBe(false);
  });

  it("el COUNT(*) de Postgres llega como BigInt y sale como número", async () => {
    // `JSON.stringify` lanza «Do not know how to serialize a BigInt», así que
    // sin esta conversión la página del panel devolvería un 500 en cuanto
    // hubiera un solo producto con variantes de precios distintos.
    const a = await auditarPrecios(
      prismaFalso({
        filasHorquilla: [
          { slug: "polo", name: "Polo", min_cents: 500, max_cents: 800, variantes: 7n },
        ],
      }),
    );
    const f = a.horquillaVariantes.ejemplos.cifra[0];
    expect(typeof f.variantes).toBe("number");
    expect(f.variantes).toBe(7);
    expect(f.saltoPct).toBeCloseTo(60, 5);
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

  it("el margen efectivo sale del multiplicador configurado", async () => {
    const a = await auditarPrecios(
      prismaFalso({
        conTarifa: [
          { slug: "a", fromPriceCents: 1000, override: null },
          { slug: "b", fromPriceCents: 2500, override: null },
        ],
      }),
    );
    const esperado = ((applyMargin(1000) - 1000) / applyMargin(1000)) * 100;
    expect(a.margenEfectivo.makito.margenMedioPct).toBeCloseTo(esperado, 0);
    expect(a.margenEfectivo.makito.margenMedioPct).toBeGreaterThan(35);
  });

  it("no escribe nada: el Prisma de mentira no tiene ni update ni create", async () => {
    // El contrato de esta función es que se puede lanzar contra producción.
    // Si alguien le añade una escritura, este test revienta con «is not a
    // function» en vez de descubrirse el día que se ejecute de verdad.
    await expect(auditarPrecios(prismaFalso())).resolves.toBeTruthy();
  });
});
