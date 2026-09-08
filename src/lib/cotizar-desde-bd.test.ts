import { describe, expect, it } from "vitest";
import {
  comprobarRolDeLectura,
  construirPedido,
  familiasDe,
  posicionesPorTecnica,
  type DatosPedido,
  type MarcajeCotizado,
  type ProductoLeido,
} from "@/lib/cotizar-desde-bd";

const datos: DatosPedido = {
  numero: "PRE-2026-0031",
  fecha: "8 de septiembre de 2026",
  asunto: null,
  cliente: { nombre: "Ayuntamiento de Granada", cif: "P1808700A", direccion: "Plaza del Carmen s/n", contacto: null },
  plazo: { min: 8, max: 15 },
  cantidad: 500,
  tecnica: "MK_P1",
  tintas: 1,
  formato: "Vector",
  incluye: "Producto y marcaje",
  capacidad: null,
  nota: null,
  foto: null,
};

const producto: ProductoLeido = {
  id: "clx1",
  name: "Taza cerámica 300 ml",
  internalRef: "STM-000123",
  material: "Cerámica",
  lengthMm: 95,
  widthMm: 80,
  heightMm: 95,
  primaryImageUrl: null,
  category: { name: "Tazas", parent: { name: "Bebida", parent: null } },
  override: null,
  variants: [{ priceTiers: [{ minQty: 1, unitPriceCents: 210 }, { minQty: 250, unitPriceCents: 180 }, { minQty: 1000, unitPriceCents: 150 }] }],
  positions: [
    { positionId: "FRONT", maxWidthMm: 60, maxHeightMm: 40, techniques: [{ technique: { code: "MK_P1", name: "Tampografía" } }] },
    { positionId: "WRAP", maxWidthMm: 200, maxHeightMm: 80, techniques: [{ technique: { code: "MK_P1", name: "Tampografía" } }, { technique: { code: "MK_S1", name: "Sublimación" } }] },
  ],
};

const marcajeOk: MarcajeCotizado = {
  codigo: "MK_P1",
  nombre: "Tampografía",
  posicion: "WRAP",
  areaMaxima: "200 × 80 mm",
  areaCm2: 160,
  // 500 uds: 0,12 €/ud variable (60,00 €) + 35,00 € de cliché
  cotizacion: { ok: true, netTotalCents: 9500, setupCents: 3500 },
};

describe("posicionesPorTecnica", () => {
  it("para cada técnica se queda con la posición de MAYOR área, y la nombra", () => {
    const m = posicionesPorTecnica(producto.positions);
    expect(m.get("MK_P1")).toMatchObject({ posicion: "WRAP", areaCm2: 160, areaMaxima: "200 × 80 mm" });
    expect(m.get("MK_S1")).toMatchObject({ posicion: "WRAP" });
  });
});

describe("familiasDe", () => {
  it("de la hoja a la raíz, sin huecos", () => {
    expect(familiasDe(producto)).toEqual(["Tazas", "Bebida"]);
  });
});

describe("construirPedido", () => {
  it("monta las TRES líneas del encargo: producto, marcaje y cliché, con coste y no con PVP", () => {
    const { pedido } = construirPedido({ datos, producto, marcaje: marcajeOk, margenes: null });
    expect(pedido.lineas).toHaveLength(3);
    // Producto al tramo de 250 (500 ≥ 250, < 1000)
    expect(pedido.lineas[0]).toMatchObject({ concepto: "Taza cerámica 300 ml", cantidad: 500, coste_unit: "1.80" });
    // Marcaje: (9500 − 3500) / 500 = 12 c/ud
    expect(pedido.lineas[1]).toMatchObject({ concepto: "Tampografía", cantidad: 500, coste_unit: "0.12" });
    // Cliché: cargo único, cantidad 1 SIEMPRE
    expect(pedido.lineas[2]).toMatchObject({ cantidad: 1, coste_unit: "35.00" });
    for (const l of pedido.lineas) expect(l).not.toHaveProperty("pvp_unit");
  });

  it("la ficha dice la posición que se ha tarificado, no otra", () => {
    const { pedido } = construirPedido({ datos, producto, marcaje: marcajeOk, margenes: null });
    expect(pedido.marcaje.posicion).toBe("WRAP");
    expect(pedido.marcaje.area).toBe("200 × 80 mm");
    expect(pedido.ficha.ref).toBe("STM-000123");
    expect(pedido.ficha.medidas).toBe("95 × 80 × 95 mm");
  });

  it("con más de una tinta lo dice en el concepto: no es la misma línea", () => {
    const { pedido } = construirPedido({ datos: { ...datos, tintas: 2 }, producto, marcaje: marcajeOk, margenes: null });
    expect(pedido.lineas[1].concepto).toBe("Tampografía a 2 tintas");
  });

  it("sin tarifa de marcaje se PARA: no deja un 0 que el margen convierta en gratis", () => {
    const sinTarifa: MarcajeCotizado = { ...marcajeOk, cotizacion: { ok: false, warning: "Sin tarifa fiable." } };
    expect(() => construirPedido({ datos, producto, marcaje: sinTarifa, margenes: null })).toThrow(/Sin tarifa/);
  });

  it("sin tramo de proveedor se PARA: no se inventa el coste", () => {
    const sinTramos = { ...producto, variants: [] };
    expect(() => construirPedido({ datos, producto: sinTramos, marcaje: marcajeOk, margenes: null })).toThrow(/no se inventa/);
  });

  it("avisa cuando el panel tiene otro margen para la familia, pero no lo aplica", () => {
    const margenes = { pordefecto: 30, familias: { tazas: 28 } };
    const { avisos, margenFamiliaPct, pedido } = construirPedido({ datos, producto, marcaje: marcajeOk, margenes });
    expect(margenFamiliaPct).toBe(28);
    expect(avisos.some((a) => /28 %/.test(a))).toBe(true);
    // El pedido sigue llevando coste, no PVP: el 30 % lo pone calcular-precios.py.
    expect(pedido.lineas[0]).toHaveProperty("coste_unit");
  });

  it("si el nombre del producto nombra al proveedor, no se emite", () => {
    const conFuga = { ...producto, name: "Taza Makito 300 ml" };
    expect(() => construirPedido({ datos, producto: conFuga, marcaje: marcajeOk, margenes: null })).toThrow(/nombra al proveedor/);
  });

  it("el JSON no lleva proveedor ni supplierRef por ningún sitio", () => {
    const { pedido } = construirPedido({ datos, producto, marcaje: marcajeOk, margenes: null });
    const texto = JSON.stringify(pedido).toLowerCase();
    for (const p of ["midocean", "makito", "cifra", "adivin", "supplierref", "supplier"]) {
      expect(texto, `aparece «${p}»`).not.toContain(p);
    }
  });
});

describe("comprobarRolDeLectura", () => {
  const dbQue = (visibles: string[]) => ({
    $queryRawUnsafe: async (sql: string) => {
      if (visibles.some((t) => sql.includes(t))) return [{ "?column?": 1 }];
      throw new Error("permission denied for table");
    },
  });

  it("pasa cuando clientes y ajustes están cerrados", async () => {
    expect(await comprobarRolDeLectura(dbQue([]))).toEqual({ ok: true });
  });

  it("PARA si el rol puede leer CartQuote", async () => {
    const r = await comprobarRolDeLectura(dbQue(['"CartQuote"']));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/CartQuote/);
  });

  it("PARA si el rol puede leer AdminSetting (el secreto del webhook vive ahí)", async () => {
    const r = await comprobarRolDeLectura(dbQue(['"AdminSetting"']));
    expect(r.ok).toBe(false);
  });
});
