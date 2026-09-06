import { describe, expect, it } from "vitest";
import {
  costeAlTramo,
  desglosarMarcaje,
  fichaDesdeProducto,
  formatearArea,
  formatearMedidas,
  lineaDeCliche,
  lineaDeMarcaje,
  lineaDesdeProducto,
  type MarcajeParaLinea,
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
  familias: ["Botellas", "Bebida"],
  margenFamiliaPct: 30,
  marcaje: { posicion: "CUERPO", areaMaxima: "60 × 80 mm", tecnica: "Grabado láser" },
};

describe("lineaDesdeProducto", () => {
  const pvp = (coste: number, margen: number) => Math.round(coste / (1 - margen / 100));

  it("el coste del catálogo NUNCA entra como verificado", () => {
    // Es la regla del encargo: los precios se miran en el portal del proveedor
    // a la cantidad exacta. El catálogo ahorra teclear, no cotiza.
    expect(lineaDesdeProducto(BOTELLA, 500, 30, pvp).costeVerificado).toBe(false);
  });

  it("copia identidad, foto y cantidad, y propone PVP al margen objetivo", () => {
    expect(lineaDesdeProducto(BOTELLA, 500, 30, pvp)).toEqual({
      concepto: "Botella de acero inoxidable 500 ml",
      referencia: "STM-10022",
      imagenUrl: "/api/m/abc123",
      cantidad: 500,
      costeUnitCents: 615,
      costeVerificado: false,
      margenPct: null,
      pvpUnitCents: 879,
    });
  });

  it("cuando la familia tiene su propio margen, la línea sale con él", () => {
    const granFormato = { ...BOTELLA, margenFamiliaPct: 22 };
    const linea = lineaDesdeProducto(granFormato, 500, 30, pvp);
    expect(linea.margenPct).toBe(22);
    expect(linea.pvpUnitCents).toBe(788); // 615 ÷ 0,78
  });

  it("si la familia coincide con el presupuesto, la línea no fija margen propio", () => {
    // Dejarlo en null hace que la línea siga al presupuesto si luego se
    // cambia el margen general; fijar un 30 duplicado la dejaría anclada.
    expect(lineaDesdeProducto(BOTELLA, 500, 30, pvp).margenPct).toBeNull();
  });

  it("sin tarifa deja coste y PVP a cero en vez de inventarse un precio", () => {
    const sinTarifa = { ...BOTELLA, costeUnitCents: null, tramoMinQty: null };
    const linea = lineaDesdeProducto(sinTarifa, 500, 30, pvp);
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

const GRABADO: MarcajeParaLinea = {
  codigo: "GRAB",
  nombre: "Grabado láser",
  costeUnitCents: 74,
  clicheCents: 2800,
  areaCm2: 48,
  tintas: 1,
  posicion: "CUERPO",
  areaMaxima: "60 × 80 mm",
  aviso: null,
};

describe("desglosarMarcaje", () => {
  it("separa el cliché del coste por unidad", () => {
    // 28,00 € de cliché + 500 × 0,74 € = 398,00 € de pedido.
    expect(desglosarMarcaje({ netTotalCents: 39800, setupCents: 2800 }, 500)).toEqual({
      costeUnitCents: 74,
      clicheCents: 2800,
    });
  });

  it("redondea el €/ud hacia arriba, nunca a la baja", () => {
    // 100,10 € de variable entre 300 uds son 0,3336…: 34 céntimos, no 33.
    // Un céntimo de menos por unidad sale de nuestro margen; uno de más lo
    // absorbe.
    expect(desglosarMarcaje({ netTotalCents: 10010, setupCents: 0 }, 300).costeUnitCents).toBe(34);
  });

  it("una técnica sin cliché deja la parte del cliché a cero", () => {
    expect(desglosarMarcaje({ netTotalCents: 12000, setupCents: 0 }, 200)).toEqual({
      costeUnitCents: 60,
      clicheCents: 0,
    });
  });

  it("no inventa un variable negativo si el setup se come el total", () => {
    expect(desglosarMarcaje({ netTotalCents: 2800, setupCents: 2800 }, 500)).toEqual({
      costeUnitCents: 0,
      clicheCents: 2800,
    });
  });
});

describe("lineaDeMarcaje y lineaDeCliche", () => {
  const pvp = (coste: number, margen: number) => Math.round(coste / (1 - margen / 100));

  it("el marcaje va por unidades y el cliché SIEMPRE a cantidad 1", () => {
    // Prorratear el cliché entre las unidades lo escondería, y el encargo pide
    // producto, marcaje y cliché por separado en el documento.
    expect(lineaDeMarcaje(GRABADO, 500, 22, 30, pvp).cantidad).toBe(500);
    expect(lineaDeCliche(GRABADO, 22, 30, pvp).cantidad).toBe(1);
  });

  it("ambas nacen sin confirmar, como el producto", () => {
    expect(lineaDeMarcaje(GRABADO, 500, 22, 30, pvp).costeVerificado).toBe(false);
    expect(lineaDeCliche(GRABADO, 22, 30, pvp).costeVerificado).toBe(false);
  });

  it("aplican el margen de la familia, no el del presupuesto", () => {
    expect(lineaDeMarcaje(GRABADO, 500, 22, 30, pvp).pvpUnitCents).toBe(95); // 74 ÷ 0,78
    expect(lineaDeCliche(GRABADO, 22, 30, pvp).pvpUnitCents).toBe(3590); // 2800 ÷ 0,78
  });

  it("y lo guardan en la línea solo si se aparta del presupuesto", () => {
    // Si no, la línea diría que va al 30 % mientras su PVP está calculado al
    // 22 %: el margen que enseña la pantalla no cuadraría con el importe.
    expect(lineaDeMarcaje(GRABADO, 500, 22, 30, pvp).margenPct).toBe(22);
    expect(lineaDeCliche(GRABADO, 22, 30, pvp).margenPct).toBe(22);
    expect(lineaDeMarcaje(GRABADO, 500, 30, 30, pvp).margenPct).toBeNull();
    expect(lineaDeCliche(GRABADO, 30, 30, pvp).margenPct).toBeNull();
  });

  it("una técnica sin tarifa entra a cero, para teclearla, no con un precio inventado", () => {
    const sinTarifa: MarcajeParaLinea = {
      ...GRABADO,
      costeUnitCents: null,
      aviso: "Técnica sin tarifa registrada — pedir cotización manual.",
    };
    const linea = lineaDeMarcaje(sinTarifa, 500, 22, 30, pvp);
    expect(linea.costeUnitCents).toBe(0);
    expect(linea.pvpUnitCents).toBe(0);
    expect(linea.costeVerificado).toBe(false);
  });

  it("el concepto del cliché dice de qué técnica es", () => {
    expect(lineaDeCliche(GRABADO, 22, 30, pvp).concepto).toBe("Cliché / pantalla · Grabado láser");
  });

  it("el concepto del marcaje dice las tintas cuando son más de una", () => {
    // «A una tinta» y «a dos tintas» no cuestan lo mismo: si el concepto no lo
    // dice, el cliente no sabe qué está aceptando.
    expect(lineaDeMarcaje(GRABADO, 500, 22, 30, pvp).concepto).toBe("Grabado láser");
    expect(lineaDeMarcaje({ ...GRABADO, tintas: 2 }, 500, 22, 30, pvp).concepto).toBe(
      "Grabado láser a 2 tintas",
    );
  });
});
