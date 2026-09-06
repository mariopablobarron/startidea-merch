import { describe, it, expect } from "vitest";
import {
  MARGEN_OBJETIVO_PCT,
  pvpDesdeCoste,
  margenResultantePct,
  redondearPvpLimpio,
  calcularLinea,
  calcularOpcion,
  calcularEscenarios,
  type PartidaCalculo,
} from "./presupuesto-calculo";

describe("pvpDesdeCoste — 30 % sobre VENTA, no sobre coste", () => {
  it("aplica coste ÷ 0,70", () => {
    // La confusión que este test cierra: un 30 % sobre coste daría 130; sobre
    // venta son 143. Diez céntimos por unidad de diferencia en una tirada de
    // 2.000 son 200 €.
    expect(pvpDesdeCoste(100, 30)).toBe(143);
    expect(pvpDesdeCoste(70, 30)).toBe(100);
    expect(pvpDesdeCoste(24300, 30)).toBe(34714);
  });

  it("el margen que sale es el que se pidió", () => {
    for (const margen of [20, 25, 30, 35, 40]) {
      const pvp = pvpDesdeCoste(1234, margen);
      expect(margenResultantePct(1234, pvp)).toBeCloseTo(margen, 1);
    }
  });

  it("sin coste no hay precio (no devuelve NaN ni infinito)", () => {
    expect(pvpDesdeCoste(0, 30)).toBe(0);
    expect(pvpDesdeCoste(-5, 30)).toBe(0);
    expect(Number.isFinite(pvpDesdeCoste(100, 100))).toBe(true);
  });
});

describe("margenResultantePct", () => {
  it("es (PVP − coste) / PVP", () => {
    expect(margenResultantePct(70, 100)).toBeCloseTo(30, 6);
    expect(margenResultantePct(50, 100)).toBeCloseTo(50, 6);
  });

  it("un PVP a cero no revienta la pantalla", () => {
    expect(margenResultantePct(100, 0)).toBe(0);
  });

  it("vender por debajo del coste da margen negativo, no cero", () => {
    // Que se vea el rojo: esconderlo en un 0 es peor que enseñarlo.
    expect(margenResultantePct(120, 100)).toBeLessThan(0);
  });
});

describe("redondearPvpLimpio — cifras que se lean, sin bajar del margen", () => {
  it("sube al precio limpio más grueso que siga en la banda 30–31 %", () => {
    // coste 24,30 € → exacto 34,71 €; 35,00 € deja 30,57 % y se lee mejor.
    expect(redondearPvpLimpio(24300)).toBe(35000);
    expect(margenResultantePct(24300, 35000)).toBeGreaterThanOrEqual(30);
    expect(margenResultantePct(24300, 35000)).toBeLessThanOrEqual(31);
  });

  it("NUNCA redondea a la baja", () => {
    for (const coste of [13, 47, 196, 1234, 24300, 98765]) {
      const exacto = pvpDesdeCoste(coste, MARGEN_OBJETIVO_PCT);
      expect(redondearPvpLimpio(coste)).toBeGreaterThanOrEqual(exacto);
    }
  });

  it("el margen redondeado se queda entre el 30 % y el 31 % siempre que quepa", () => {
    for (const coste of [700, 1400, 2100, 7000, 14000, 24300, 50000]) {
      const pvp = redondearPvpLimpio(coste);
      const margen = margenResultantePct(coste, pvp);
      expect(margen, `coste ${coste} → pvp ${pvp}`).toBeGreaterThanOrEqual(30 - 0.01);
      expect(margen, `coste ${coste} → pvp ${pvp}`).toBeLessThanOrEqual(31);
    }
  });

  it("con céntimos sueltos, donde un céntimo ya se sale de banda, devuelve el exacto", () => {
    // Coste 0,20 € → exacto 0,29 €. No hay cifra "limpia" posible: un céntimo
    // arriba son más de 3 puntos de margen. Se devuelve el exacto y el panel
    // enseña el margen real; no se inventa una banda que no cabe.
    const pvp = redondearPvpLimpio(20);
    expect(pvp).toBe(pvpDesdeCoste(20, 30));
    expect(margenResultantePct(20, pvp)).toBeGreaterThanOrEqual(30);
  });

  it("un margen objetivo distinto manda sobre el 30 % por defecto", () => {
    const pvp = redondearPvpLimpio(1000, 40, 41);
    expect(margenResultantePct(1000, pvp)).toBeGreaterThanOrEqual(40);
    expect(margenResultantePct(1000, pvp)).toBeLessThanOrEqual(41);
  });
});

describe("calcularLinea", () => {
  it("multiplica por cantidad y saca el margen de la línea", () => {
    const t = calcularLinea({ tipo: "PRODUCTO", cantidad: 2000, costeUnitCents: 20, pvpUnitCents: 28 });
    expect(t.costeCents).toBe(40000);
    expect(t.importeCents).toBe(56000);
    expect(t.margenCents).toBe(16000);
    expect(t.margenPct).toBeCloseTo(28.57, 1);
  });

  it("el cliché es una línea de cantidad 1, no un importe repartido", () => {
    const t = calcularLinea({ tipo: "CLICHE", cantidad: 1, costeUnitCents: 2800, pvpUnitCents: 4000 });
    expect(t.importeCents).toBe(4000);
  });

  it("avisa por debajo del 20 % de margen", () => {
    expect(calcularLinea({ tipo: "PRODUCTO", cantidad: 10, costeUnitCents: 90, pvpUnitCents: 100 }).avisoMargen).toBe(true);
    expect(calcularLinea({ tipo: "PRODUCTO", cantidad: 10, costeUnitCents: 70, pvpUnitCents: 100 }).avisoMargen).toBe(false);
  });

  it("una línea todavía sin precio no cuenta como margen bajo", () => {
    // Si no, el editor sale lleno de avisos rojos nada más crear una línea.
    expect(calcularLinea({ tipo: "PRODUCTO", cantidad: 10, costeUnitCents: 70, pvpUnitCents: 0 }).avisoMargen).toBe(false);
  });
});

describe("calcularOpcion — base, IVA 21 % desglosado y total", () => {
  const lineas = [
    { tipo: "PRODUCTO" as const, cantidad: 2000, costeUnitCents: 20, pvpUnitCents: 28 },
    { tipo: "MARCAJE" as const, cantidad: 2000, costeUnitCents: 15, pvpUnitCents: 22 },
    { tipo: "CLICHE" as const, cantidad: 1, costeUnitCents: 2800, pvpUnitCents: 4000 },
  ];

  it("suma las líneas y desglosa el IVA aparte de la base", () => {
    const t = calcularOpcion(lineas);
    expect(t.baseCents).toBe(2000 * 28 + 2000 * 22 + 4000); // 104.000 = 1.040,00 €
    expect(t.ivaCents).toBe(21840);
    expect(t.totalCents).toBe(125840);
    // El invariante que no puede romperse: total = base + IVA, ni un céntimo.
    expect(t.totalCents).toBe(t.baseCents + t.ivaCents);
  });

  it("da el coste y el margen del conjunto, que es lo que decide Mario", () => {
    const t = calcularOpcion(lineas);
    expect(t.costeCents).toBe(2000 * 20 + 2000 * 15 + 2800);
    expect(t.margenCents).toBe(t.baseCents - t.costeCents);
    expect(t.margenPct).toBeCloseTo(margenResultantePct(t.costeCents, t.baseCents), 6);
  });

  it("cuenta cuántas líneas van por debajo del aviso", () => {
    const t = calcularOpcion([...lineas, { tipo: "OTRO", cantidad: 1, costeUnitCents: 95, pvpUnitCents: 100 }]);
    expect(t.lineasBajoMargen).toBe(1);
  });

  it("una opción vacía no da NaN", () => {
    const t = calcularOpcion([]);
    expect(t).toMatchObject({ baseCents: 0, ivaCents: 0, totalCents: 0, margenPct: 0 });
  });
});

describe("calcularEscenarios — los bloques de totales del documento", () => {
  const photocall: PartidaCalculo = {
    id: "p1",
    titulo: "Photocall",
    opciones: [
      {
        id: "o1",
        nombre: "única",
        recomendada: true,
        lineas: [{ tipo: "PRODUCTO", cantidad: 1, costeUnitCents: 18400, pvpUnitCents: 26286 }],
      },
    ],
  };
  const vasos: PartidaCalculo = {
    id: "p2",
    titulo: "Vasos",
    opciones: [
      {
        id: "a",
        nombre: "Yonrax",
        recomendada: true,
        lineas: [
          { tipo: "PRODUCTO", cantidad: 2000, costeUnitCents: 20, pvpUnitCents: 28 },
          { tipo: "MARCAJE", cantidad: 2000, costeUnitCents: 15, pvpUnitCents: 22 },
          { tipo: "CLICHE", cantidad: 1, costeUnitCents: 2800, pvpUnitCents: 4000 },
        ],
      },
      {
        id: "b",
        nombre: "Cuvak",
        recomendada: false,
        lineas: [
          { tipo: "PRODUCTO", cantidad: 2000, costeUnitCents: 8, pvpUnitCents: 11 },
          { tipo: "MARCAJE", cantidad: 2000, costeUnitCents: 15, pvpUnitCents: 22 },
          { tipo: "CLICHE", cantidad: 1, costeUnitCents: 2800, pvpUnitCents: 4000 },
        ],
      },
    ],
  };

  it("sin alternativas, un solo bloque de totales", () => {
    const esc = calcularEscenarios([photocall]);
    expect(esc).toHaveLength(1);
    expect(esc[0].etiqueta).toBe("Total");
    expect(esc[0].totales.baseCents).toBe(26286);
  });

  it("con dos calidades, un total por opción y el resto en su recomendada", () => {
    const esc = calcularEscenarios([photocall, vasos]);
    expect(esc.map((e) => e.etiqueta)).toEqual([
      "Total con opción A · Yonrax",
      "Total con opción B · Cuvak",
    ]);
    // Los dos números del presupuesto real que sirve de patrón.
    expect(esc[0].totales.baseCents).toBe(26286 + 104000);
    expect(esc[1].totales.baseCents).toBe(26286 + 70000);
    expect(esc[0].totales.totalCents).toBe(esc[0].totales.baseCents + esc[0].totales.ivaCents);
  });

  it("marca cuál es la recomendada y deja dicha la selección de cada bloque", () => {
    const esc = calcularEscenarios([photocall, vasos]);
    expect(esc[0].recomendado).toBe(true);
    expect(esc[1].recomendado).toBe(false);
    expect(esc[0].seleccion).toEqual({ p2: "a", p1: "o1" });
  });

  it("con dos partidas de alternativas NO hace el producto cartesiano", () => {
    // Cuatro bloques de totales en una página con sitio para dos es un
    // presupuesto que ya no se compara. Se varía la primera partida con
    // alternativas y el resto va en su recomendada.
    const otra: PartidaCalculo = { ...vasos, id: "p3" };
    const esc = calcularEscenarios([vasos, otra]);
    expect(esc).toHaveLength(2);
  });

  it("sin partidas devuelve un total a cero, no una lista vacía", () => {
    const esc = calcularEscenarios([]);
    expect(esc).toHaveLength(1);
    expect(esc[0].totales.totalCents).toBe(0);
  });
});

describe("dos opciones marcadas como recomendada (datos viejos)", () => {
  it("solo una manda: la primera", () => {
    // El editor lo permitía al añadir una alternativa, así que puede haber
    // presupuestos guardados así. Dos recomendaciones en el mismo documento
    // dejan al cliente sin saber cuál mirar.
    const esc = calcularEscenarios([
      {
        id: "p",
        titulo: "Vasos",
        opciones: [
          { id: "a", nombre: "A", recomendada: true, lineas: [{ tipo: "PRODUCTO", cantidad: 10, costeUnitCents: 70, pvpUnitCents: 100 }] },
          { id: "b", nombre: "B", recomendada: true, lineas: [{ tipo: "PRODUCTO", cantidad: 10, costeUnitCents: 35, pvpUnitCents: 50 }] },
        ],
      },
    ]);
    expect(esc.map((e) => e.recomendado)).toEqual([true, false]);
  });
});

describe("redondearPvpLimpio — la banda sigue al margen objetivo", () => {
  // Con un techo absoluto del 31 % el redondeo ignoraba el margen que se le
  // pedía. Estos dos casos son los que se rompían.
  it("un margen bajo no se redondea hasta el 30 %", () => {
    // 45,00 € al 22 % son 57,69 €; la cifra limpia es 58,00 € (22,4 %), no
    // 60,00 €, que dejaría un 25 % que nadie ha pedido.
    const pvp = redondearPvpLimpio(4500, 22);
    expect(pvp).toBe(5800);
    expect(margenResultantePct(4500, pvp)).toBeLessThanOrEqual(23);
  });

  it("un margen alto sigue encontrando cifra limpia", () => {
    // Con el techo fijo del 31 % la banda [40, 31] estaba vacía y salía el
    // exacto, 16,67 €, sin redondear. Ahora sube a 16,70 €: 17,00 € dejaría un
    // 41,2 %, ya fuera de banda.
    const pvp = redondearPvpLimpio(1000, 40);
    expect(pvp).toBe(1670);
    expect(margenResultantePct(1000, pvp)).toBeGreaterThanOrEqual(40);
    expect(margenResultantePct(1000, pvp)).toBeLessThanOrEqual(41);
  });

  it("el 30 % de siempre no cambia", () => {
    expect(redondearPvpLimpio(24300)).toBe(35000);
  });
});
