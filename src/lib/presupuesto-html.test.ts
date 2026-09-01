import { describe, it, expect } from "vitest";
import {
  renderPresupuestoHtml,
  condicionesEstandar,
  assertSinFugasDeProveedor,
  formatearFechaLarga,
  type PresupuestoRender,
} from "./presupuesto-html";

/**
 * El documento que sale de aquí se envía a un cliente. Estos tests fijan las
 * reglas del encargo que no son negociables, para que se rompan en CI y no en
 * el correo de un cliente.
 */

function presupuestoDemo(over: Partial<PresupuestoRender> = {}): PresupuestoRender {
  return {
    numero: "PRE-2026-0001",
    fecha: new Date("2026-09-01T10:00:00Z"),
    asunto: "Photocall transportable de 3 m y 2.000 vasos reutilizables de 400 ml",
    clienteNombre: "Tus Territorios",
    clienteContacto: "Jose",
    clienteReferencia: "Ref. contacto: Club Cámara",
    validezDias: 30,
    plazoMinDias: 8,
    plazoMaxDias: 15,
    produccionCentroEspecialEmpleo: false,
    partidas: [
      {
        id: "p1",
        orden: 1,
        titulo: "Photocall transportable",
        descripcion: "Pack completo de 3 m de ancho × 2,3 m de alto. Fabricación bajo pedido.",
        opciones: [
          {
            id: "p1o1",
            nombre: "única",
            recomendada: true,
            medidas: "300 × 230 cm",
            materiales: "Lona frontlit PVC 510 g/m², impresión UV a una cara",
            incluye: "Estructura, lona impresa, tensores y estuche de transporte",
            lineas: [
              {
                tipo: "PRODUCTO",
                concepto: "Photocall pack completo 300 × 230 cm",
                descripcion: "Estructura de tubo de aluminio lacado y lona impresa a una cara.",
                cantidad: 1,
                costeUnitCents: 18400,
                pvpUnitCents: 26286,
              },
            ],
          },
        ],
      },
      {
        id: "p2",
        orden: 2,
        titulo: "2.000 vasos reutilizables de 400 ml",
        descripcion: "Dos alternativas según el uso previsto.",
        opciones: [
          {
            id: "p2a",
            nombre: "Yonrax",
            recomendada: true,
            medidas: "400 ml",
            materiales: "Polipropileno esmerilado, 36 g",
            marcajeTecnica: "Serigrafía circular",
            marcajeTintas: "1 tinta plana",
            marcajePosicion: "Alrededor del vaso",
            marcajeAreaMaxima: "150 × 70 mm",
            lineas: [
              { tipo: "PRODUCTO", concepto: "Vaso PP esmerilado, 36 g", referencia: "STM-4D2GEK", cantidad: 2000, costeUnitCents: 20, pvpUnitCents: 28 },
              { tipo: "MARCAJE", concepto: "Serigrafía circular 1 tinta", cantidad: 2000, costeUnitCents: 15, pvpUnitCents: 22 },
              { tipo: "CLICHE", concepto: "Pantalla y fotolito", cantidad: 1, costeUnitCents: 2800, pvpUnitCents: 4000 },
            ],
          },
          {
            id: "p2b",
            nombre: "Cuvak",
            recomendada: false,
            medidas: "400 ml",
            materiales: "Polipropileno translúcido, 14 g",
            lineas: [
              { tipo: "PRODUCTO", concepto: "Vaso PP translúcido, 14 g", referencia: "STM-GBA9TZ", cantidad: 2000, costeUnitCents: 8, pvpUnitCents: 11 },
              { tipo: "MARCAJE", concepto: "Serigrafía circular 1 tinta", cantidad: 2000, costeUnitCents: 15, pvpUnitCents: 22 },
              { tipo: "CLICHE", concepto: "Pantalla y fotolito", cantidad: 1, costeUnitCents: 2800, pvpUnitCents: 4000 },
            ],
          },
        ],
      },
    ],
    ...over,
  };
}

describe("estructura del documento", () => {
  const html = renderPresupuestoHtml(presupuestoDemo());

  it("es oferta + detalle técnico + condiciones, con el pie numerado", () => {
    // El formato aprobado son tres páginas y con un presupuesto corto salen
    // tres (lo fija el test de paginación de más abajo). El del patrón, con
    // dos partidas y descripciones largas, ocupa una página más de oferta: se
    // prefiere una página de más a recortar líneas en silencio.
    const paginas = html.match(/<section class="page/g)!.length;
    expect(paginas).toBeGreaterThanOrEqual(3);
    expect(html).toContain(`Página 1 de ${paginas}`);
    expect(html).toContain(`Página ${paginas} de ${paginas}`);
    expect(html).toContain("Producto, materiales y medidas de marcaje");
    expect(html).toContain("Condiciones de la oferta");
  });

  it("lleva el CSS de la plantilla aprobada, no uno propio", () => {
    // Si alguien duplica los estilos aquí, el documento del panel y el que se
    // genera a mano empiezan a separarse.
    expect(html).toContain("@page{size:A4;margin:0}");
    expect(html).toContain("--grad-a:#8F1039");
    expect(html).toContain("--rosa:#FDEEF3");
  });

  it("las tipografías y el logotipo van embebidos: se imprime igual sin red", () => {
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("data:image/png;base64,");
  });

  it("emite Startidea Málaga, S.L. con su CIF — nunca Startidea Consulting", () => {
    expect(html).toContain("Startidea Málaga, S.L.");
    expect(html).toContain("B19583632");
    expect(html).not.toMatch(/Startidea Consulting/i);
  });
});

describe("dinero: desglose y cuadre", () => {
  const html = renderPresupuestoHtml(presupuestoDemo());

  it("desglosa producto, marcaje y cliché en líneas separadas", () => {
    expect(html).toContain("Serigrafía circular 1 tinta");
    expect(html).toContain("Pantalla y fotolito");
  });

  it("el IVA del 21 % va aparte de la base imponible", () => {
    expect(html).toContain("Base imponible");
    expect(html).toContain("IVA 21 %");
  });

  it("saca un bloque de totales por opción con los importes correctos", () => {
    // Opción A: 262,86 + 560,00 + 440,00 + 40,00 = 1.302,86 → IVA 273,60 → 1.576,46
    expect(html).toContain("Total con opción A · Yonrax");
    expect(html).toContain("1.302,86");
    expect(html).toContain("273,60");
    expect(html).toContain("1.576,46");
    // Opción B: 262,86 + 220,00 + 440,00 + 40,00 = 962,86 → IVA 202,20 → 1.165,06
    expect(html).toContain("Total con opción B · Cuvak");
    expect(html).toContain("962,86");
    expect(html).toContain("1.165,06");
  });

  it("marca cuál es la recomendada", () => {
    expect(html).toMatch(/class="caja destacada"/);
  });
});

describe("reglas de contenido que el generador GARANTIZA", () => {
  it("el plazo va en rango y desde la validación del arte final, sin fechas", () => {
    const html = renderPresupuestoHtml(presupuestoDemo());
    expect(html).toContain("Entre 8 y 15 días laborables");
    expect(html).toContain("desde la validación del arte final");
    // Ninguna fecha con formato de calendario en las condiciones.
    const condiciones = html.slice(html.indexOf("Condiciones de la oferta"));
    expect(condiciones).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  });

  it("no hay punto de facturación ni VeriFactu", () => {
    const html = renderPresupuestoHtml(presupuestoDemo());
    expect(html).not.toMatch(/verifactu/i);
    expect(html).not.toMatch(/punto de facturaci/i);
  });

  it("la forma de pago es la del encargo, palabra por palabra", () => {
    const html = renderPresupuestoHtml(presupuestoDemo());
    expect(html).toContain(
      "100 % a la confirmación del presupuesto, momento en el que se pone en marcha la producción",
    );
  });

  it("NO habla de impacto social salvo que se marque en ese pedido", () => {
    expect(renderPresupuestoHtml(presupuestoDemo())).not.toMatch(/Centros Especiales de Empleo/i);
    const conImpacto = renderPresupuestoHtml(
      presupuestoDemo({ produccionCentroEspecialEmpleo: true }),
    );
    expect(conImpacto).toMatch(/Centros Especiales de Empleo/);
  });

  it("la nota técnica sale solo si la hay", () => {
    expect(renderPresupuestoHtml(presupuestoDemo())).not.toContain("Notas técnicas");
    const conNota = renderPresupuestoHtml(
      presupuestoDemo({
        notaTecnicaTitulo: "Sobre la tinta transparente",
        notaTecnica: "El vaso es translúcido: una tinta transparente sería invisible.",
      }),
    );
    expect(conNota).toContain("Sobre la tinta transparente");
    expect(conNota).toContain("sería invisible");
  });

  it("la fecha se escribe en español, no en formato de máquina", () => {
    expect(formatearFechaLarga(new Date("2026-09-01T10:00:00Z"))).toBe("1 de septiembre de 2026");
  });
});

describe("no se nombra a ningún proveedor", () => {
  it("un nombre de proveedor en una línea REVIENTA el documento", () => {
    // Copiar y pegar del portal es exactamente como se cuela.
    expect(() =>
      renderPresupuestoHtml(
        presupuestoDemo({
          partidas: [
            {
              id: "p1",
              orden: 1,
              titulo: "Vasos",
              opciones: [
                {
                  id: "o1",
                  nombre: "única",
                  recomendada: true,
                  lineas: [
                    {
                      tipo: "PRODUCTO",
                      concepto: "Vaso 400 ml",
                      descripcion: "Referencia Makito 2555, stock en almacén.",
                      cantidad: 100,
                      costeUnitCents: 20,
                      pvpUnitCents: 28,
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/menciona al proveedor/i);
  });

  it("assertSinFugasDeProveedor deja pasar un documento limpio", () => {
    expect(() => assertSinFugasDeProveedor("<p>Vaso reutilizable de 400 ml</p>")).not.toThrow();
  });
});

describe("el HTML no se rompe con lo que escriba Mario", () => {
  it("escapa el texto del cliente en vez de inyectarlo", () => {
    const html = renderPresupuestoHtml(
      presupuestoDemo({ clienteNombre: 'Acme & Cía <script>alert("x")</script>' }),
    );
    expect(html).toContain("Acme &amp; Cía");
    expect(html).not.toContain("<script>alert");
  });

  it("respeta los saltos de línea de una nota larga", () => {
    const html = renderPresupuestoHtml(
      presupuestoDemo({ notaTecnica: "Primera línea.\nSegunda línea." }),
    );
    expect(html).toContain("Primera línea.<br>Segunda línea.");
  });
});

describe("condicionesEstandar", () => {
  it("son las siete del encargo", () => {
    const c = condicionesEstandar(8, 15);
    expect(c.map((x) => x.titulo)).toEqual([
      "Plazo de producción",
      "Entrega",
      "Impuestos",
      "Forma de pago",
      "Artes finales",
      "Cantidades",
      "Validez de la oferta",
    ]);
  });

  it("la entrega dice península incluida y las islas aparte", () => {
    const entrega = condicionesEstandar(8, 15).find((c) => c.titulo === "Entrega")!;
    expect(entrega.texto).toMatch(/península incluido/);
    expect(entrega.texto).toMatch(/Baleares, Canarias, Ceuta y Melilla/);
  });

  it("unas condiciones editadas sustituyen a las estándar", () => {
    const html = renderPresupuestoHtml(
      presupuestoDemo({ condiciones: [{ titulo: "Plazo", texto: "Entre 20 y 25 días laborables desde la validación del arte final." }] }),
    );
    expect(html).toContain("Entre 20 y 25 días laborables");
    expect(html).not.toContain("Validez de la oferta");
  });
});

describe("paginación de la oferta", () => {
  it("un presupuesto corto cabe en las tres páginas del formato", () => {
    const html = renderPresupuestoHtml(
      presupuestoDemo({
        partidas: [
          {
            id: "p1",
            orden: 1,
            titulo: "Bolsas de algodón",
            opciones: [
              {
                id: "o1",
                nombre: "única",
                recomendada: true,
                lineas: [
                  { tipo: "PRODUCTO", concepto: "Bolsa 140 g/m²", cantidad: 500, costeUnitCents: 90, pvpUnitCents: 129 },
                  { tipo: "MARCAJE", concepto: "Serigrafía 1 tinta", cantidad: 500, costeUnitCents: 30, pvpUnitCents: 43 },
                  { tipo: "CLICHE", concepto: "Pantalla", cantidad: 1, costeUnitCents: 2800, pvpUnitCents: 4000 },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(html.match(/<section class="page/g)).toHaveLength(3);
    expect(html).toContain("Página 3 de 3");
  });

  it("un presupuesto largo NO se recorta: crece en páginas y las numera bien", () => {
    // El `.page{overflow:hidden}` de la plantilla recortaría las líneas que no
    // caben SIN AVISAR: el cliente recibiría un PDF con la mitad de la oferta
    // y un total que no cuadra con lo que ve. Es el fallo más caro posible.
    const lineas = Array.from({ length: 30 }, (_, i) => ({
      tipo: "PRODUCTO" as const,
      concepto: `Artículo ${i + 1} del lote`,
      descripcion: "Descripción larga para que la fila ocupe dos líneas de texto en la columna.",
      cantidad: 100,
      costeUnitCents: 100 + i,
      pvpUnitCents: 143 + i,
    }));
    const html = renderPresupuestoHtml(
      presupuestoDemo({
        partidas: [
          { id: "p1", orden: 1, titulo: "Lote grande", opciones: [{ id: "o1", nombre: "única", recomendada: true, lineas }] },
        ],
      }),
    );

    const paginas = html.match(/<section class="page/g)!.length;
    expect(paginas).toBeGreaterThan(3);
    // Todas las líneas siguen en el documento.
    for (const l of lineas) expect(html).toContain(l.concepto);
    // Y la numeración del pie cuadra con las páginas que hay.
    expect(html).toContain(`Página ${paginas} de ${paginas}`);
    expect(html).toContain(`Página 1 de ${paginas}`);
  });

  it("un encabezado de opción no se queda solo al final de una página", () => {
    // Ver «Opción B ·» al pie de una página y sus líneas en la siguiente se
    // lee como un error de maquetación.
    const muchas = Array.from({ length: 9 }, (_, i) => ({
      tipo: "PRODUCTO" as const,
      concepto: `Línea ${i + 1}`,
      descripcion: "Texto de descripción suficientemente largo para ocupar dos líneas en la columna de concepto.",
      cantidad: 10,
      costeUnitCents: 100,
      pvpUnitCents: 143,
    }));
    const html = renderPresupuestoHtml(
      presupuestoDemo({
        partidas: [
          {
            id: "p1",
            orden: 1,
            titulo: "Partida con alternativas",
            opciones: [
              { id: "a", nombre: "A", recomendada: true, lineas: muchas },
              { id: "b", nombre: "B", recomendada: false, lineas: muchas },
            ],
          },
        ],
      }),
    );
    for (const pagina of html.split('<section class="page').slice(1)) {
      const cuerpo = pagina.slice(0, pagina.indexOf("</table>") + 1);
      const filas = [...cuerpo.matchAll(/<tr class="(opt[^"]*|titulo-partida)"|<tr>/g)];
      if (filas.length === 0) continue;
      expect(filas[filas.length - 1][0], "una página termina en un encabezado suelto").toBe("<tr>");
    }
  });
});
