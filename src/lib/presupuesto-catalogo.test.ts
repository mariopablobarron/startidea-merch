import { describe, expect, it } from "vitest";
import {
  costeAlTramo,
  fichaDesdeProducto,
  formatearArea,
  formatearMedidas,
  lineaDesdeProducto,
  type ProductoParaLinea,
} from "@/lib/presupuesto-catalogo";

describe("formatearMedidas", () => {
  it("junta las tres cotas con el símbolo de multiplicar", () => {
    expect(formatearMedidas({ lengthMm: 300, widthMm: 230, heightMm: 100 })).toBe(
      "300 × 230 × 100 mm",
    );
  });

  it("omite las cotas que el proveedor no manda", () => {
    expect(formatearMedidas({ lengthMm: 300, widthMm: null, heightMm: undefined })).toBe("300 mm");
  });

  it("devuelve null si no hay ninguna medida", () => {
    expect(formatearMedidas({})).toBeNull();
    // Un 0 no es una medida: es el hueco del feed.
    expect(formatearMedidas({ lengthMm: 0, widthMm: 0, heightMm: 0 })).toBeNull();
  });
});

describe("formatearArea", () => {
  it("redondea a milímetros enteros", () => {
    expect(formatearArea(149.6, 70.2)).toBe("150 × 70 mm");
  });

  it("exige las dos cotas: media área no es un área", () => {
    expect(formatearArea(150, null)).toBeNull();
    expect(formatearArea(null, 70)).toBeNull();
    expect(formatearArea(0, 70)).toBeNull();
  });
});

describe("costeAlTramo", () => {
  const tramos = [
    { minQty: 50, unitPriceCents: 320 },
    { minQty: 250, unitPriceCents: 280 },
    { minQty: 1000, unitPriceCents: 240 },
  ];

  it("coge el tramo que la cantidad alcanza, no el siguiente", () => {
    expect(costeAlTramo(tramos, 300)).toEqual({ costeUnitCents: 280, tramoMinQty: 250 });
    expect(costeAlTramo(tramos, 999)).toEqual({ costeUnitCents: 280, tramoMinQty: 250 });
    expect(costeAlTramo(tramos, 1000)).toEqual({ costeUnitCents: 240, tramoMinQty: 1000 });
  });

  it("por debajo del primer tramo cobra el precio más caro, no el más barato", () => {
    // Prometer el precio de 1.000 uds en un pedido de 10 sería regalar margen.
    expect(costeAlTramo(tramos, 10)).toEqual({ costeUnitCents: 320, tramoMinQty: 50 });
  });

  it("no se fía del orden en que vengan los tramos", () => {
    const desordenados = [...tramos].reverse();
    expect(costeAlTramo(desordenados, 300)).toEqual({ costeUnitCents: 280, tramoMinQty: 250 });
  });

  it("devuelve null sin tarifa: mejor un hueco que un precio inventado", () => {
    expect(costeAlTramo([], 300)).toBeNull();
  });
});

const BOTELLA: ProductoParaLinea = {
  slug: "botella-acero-500",
  referencia: "STM-10022",
  nombre: "Botella de acero inoxidable 500 ml",
  imagenUrl: "/api/m/abc123",
  material: "Acero inoxidable 18/8",
  medidas: "70 × 70 × 250 mm",
  costeUnitCents: 615,
  tramoMinQty: 500,
  marcaje: { posicion: "CUERPO", areaMaxima: "60 × 80 mm", tecnica: "Grabado láser" },
};

describe("lineaDesdeProducto", () => {
  const pvpAl30 = (coste: number) => Math.round(coste / 0.7);

  it("el coste del catálogo NUNCA entra como verificado", () => {
    // Es la regla del encargo: los precios se miran en el portal del proveedor
    // a la cantidad exacta. El catálogo ahorra teclear, no cotiza.
    expect(lineaDesdeProducto(BOTELLA, 500, pvpAl30).costeVerificado).toBe(false);
  });

  it("copia identidad, foto y cantidad, y propone PVP al margen objetivo", () => {
    expect(lineaDesdeProducto(BOTELLA, 500, pvpAl30)).toEqual({
      concepto: "Botella de acero inoxidable 500 ml",
      referencia: "STM-10022",
      imagenUrl: "/api/m/abc123",
      cantidad: 500,
      costeUnitCents: 615,
      costeVerificado: false,
      pvpUnitCents: 879,
    });
  });

  it("sin tarifa deja coste y PVP a cero en vez de inventarse un precio", () => {
    const sinTarifa = { ...BOTELLA, costeUnitCents: null, tramoMinQty: null };
    const linea = lineaDesdeProducto(sinTarifa, 500, pvpAl30);
    expect(linea.costeUnitCents).toBe(0);
    expect(linea.pvpUnitCents).toBe(0);
  });
});

describe("fichaDesdeProducto", () => {
  const vacia = {
    fotoProductoUrl: "",
    medidas: "",
    materiales: "",
    marcajeAreaMaxima: "",
    marcajeTecnica: "",
    marcajePosicion: "",
  };

  it("rellena la ficha vacía con lo que trae el producto", () => {
    expect(fichaDesdeProducto(vacia, BOTELLA)).toEqual({
      fotoProductoUrl: "/api/m/abc123",
      medidas: "70 × 70 × 250 mm",
      materiales: "Acero inoxidable 18/8",
      marcajeAreaMaxima: "60 × 80 mm",
      marcajeTecnica: "Grabado láser",
      marcajePosicion: "CUERPO",
    });
  });

  it("no pisa lo que ya está escrito a mano", () => {
    const aMano = { ...vacia, medidas: "Ø 70 × 250 mm", marcajeTecnica: "Serigrafía a 2 tintas" };
    const ficha = fichaDesdeProducto(aMano, BOTELLA);
    expect(ficha.medidas).toBe("Ø 70 × 250 mm");
    expect(ficha.marcajeTecnica).toBe("Serigrafía a 2 tintas");
    // Lo que seguía vacío sí se completa.
    expect(ficha.marcajePosicion).toBe("CUERPO");
  });

  it("un campo con solo espacios cuenta como vacío", () => {
    expect(fichaDesdeProducto({ ...vacia, materiales: "   " }, BOTELLA).materiales).toBe(
      "Acero inoxidable 18/8",
    );
  });

  it("si el producto no trae el dato, la ficha se queda como estaba", () => {
    const pelado = { ...BOTELLA, material: null, medidas: null, marcaje: null };
    expect(fichaDesdeProducto(vacia, pelado)).toEqual({ ...vacia, fotoProductoUrl: "/api/m/abc123" });
  });
});
