import { describe, it, expect } from "vitest";
import { clasificarFrescura, type ProductoFrescura, type ModoProveedor } from "./catalog-freshness";

const AHORA = new Date("2026-09-06T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

/** Fecha a N días exactos antes de `AHORA`. */
function haceDias(n: number): Date {
  return new Date(AHORA.getTime() - n * DIA);
}

const PROVEEDORES: ModoProveedor[] = [
  { code: "midocean", hasAutoSync: true },
  { code: "makito", hasAutoSync: true },
  { code: "cifra", hasAutoSync: true },
  { code: "adivin", hasAutoSync: false },
];

function clasificar(productos: ProductoFrescura[], diasUmbral = 7) {
  return clasificarFrescura({ productos, proveedores: PROVEEDORES, ahora: AHORA, diasUmbral });
}

describe("clasificarFrescura", () => {
  it("una ficha refrescada esta madrugada no es obsoleta", () => {
    const r = clasificar([{ slug: "a", supplier: "makito", syncedAt: haceDias(0) }]);
    expect(r.total).toBe(0);
    expect(r.obsoletas).toEqual([]);
  });

  it("una ficha de proveedor automático sin refrescar en meses SÍ es obsoleta", () => {
    const r = clasificar([{ slug: "a", supplier: "midocean", syncedAt: haceDias(60) }]);
    expect(r.total).toBe(1);
    expect(r.obsoletas[0]).toMatchObject({ slug: "a", supplier: "midocean", dias: 60 });
    expect(r.porProveedor).toEqual({ midocean: 1 });
  });

  it("un proveedor SIN sync automático no dispara aviso, se cuenta aparte", () => {
    const r = clasificar([{ slug: "a", supplier: "adivin", syncedAt: haceDias(85) }]);
    expect(r.total).toBe(0);
    expect(r.obsoletas).toEqual([]);
    expect(r.manualesAntiguas).toEqual({ adivin: 1 });
  });

  it("`syncedAt` nulo cuenta como obsoleto: nunca llegó a refrescarse", () => {
    const r = clasificar([{ slug: "a", supplier: "cifra", syncedAt: null }]);
    expect(r.total).toBe(1);
    expect(r.obsoletas[0].dias).toBeNull();
  });

  it("un proveedor no declarado en `Supplier` se vigila igual y se nombra", () => {
    const r = clasificar([{ slug: "a", supplier: "proveedor-nuevo", syncedAt: haceDias(30) }]);
    expect(r.total).toBe(1);
    expect(r.proveedoresNoDeclarados).toEqual(["proveedor-nuevo"]);
  });

  it("la frontera del umbral: justo por debajo no cuenta, justo por encima sí", () => {
    // 6 días < umbral de 7 ⇒ fresca. 8 días > 7 ⇒ obsoleta.
    const dentro = clasificar([{ slug: "a", supplier: "makito", syncedAt: haceDias(6) }]);
    expect(dentro.total).toBe(0);
    const fuera = clasificar([{ slug: "b", supplier: "makito", syncedAt: haceDias(8) }]);
    expect(fuera.total).toBe(1);
  });

  it("las más antiguas van primero, que son las que peor dato publican", () => {
    const r = clasificar([
      { slug: "reciente", supplier: "cifra", syncedAt: haceDias(10) },
      { slug: "antigua", supplier: "cifra", syncedAt: haceDias(90) },
      { slug: "nunca", supplier: "cifra", syncedAt: null },
    ]);
    expect(r.obsoletas.map((o) => o.slug)).toEqual(["nunca", "antigua", "reciente"]);
  });

  it("reproduce la foto real de producción del 2026-09-06 (regresión)", () => {
    // Medido en la BD: midocean 50 y cifra 31 obsoletas (ambos automáticos),
    // adivin 59 antiguas pero manuales, makito entero al día.
    const productos: ProductoFrescura[] = [
      ...Array.from({ length: 50 }, (_, i) => ({ slug: `mo-${i}`, supplier: "midocean", syncedAt: haceDias(45) })),
      ...Array.from({ length: 31 }, (_, i) => ({ slug: `ci-${i}`, supplier: "cifra", syncedAt: haceDias(40) })),
      ...Array.from({ length: 59 }, (_, i) => ({ slug: `ad-${i}`, supplier: "adivin", syncedAt: haceDias(85) })),
      ...Array.from({ length: 100 }, (_, i) => ({ slug: `mk-${i}`, supplier: "makito", syncedAt: haceDias(0) })),
    ];
    const r = clasificar(productos);
    expect(r.total).toBe(81);
    expect(r.porProveedor).toEqual({ midocean: 50, cifra: 31 });
    expect(r.manualesAntiguas).toEqual({ adivin: 59 });
    expect(r.proveedoresNoDeclarados).toEqual([]);
  });

  it("si un proveedor manual pasa a automático, sus fichas viejas empiezan a contar", () => {
    const productos: ProductoFrescura[] = [{ slug: "a", supplier: "adivin", syncedAt: haceDias(85) }];
    const comoManual = clasificarFrescura({ productos, proveedores: PROVEEDORES, ahora: AHORA, diasUmbral: 7 });
    expect(comoManual.total).toBe(0);

    const proveedoresCambiados = PROVEEDORES.map((p) => (p.code === "adivin" ? { ...p, hasAutoSync: true } : p));
    const comoAuto = clasificarFrescura({ productos, proveedores: proveedoresCambiados, ahora: AHORA, diasUmbral: 7 });
    expect(comoAuto.total).toBe(1);
  });
});
