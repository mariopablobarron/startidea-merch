import { describe, expect, it } from "vitest";
import { entradaDuplicada } from "@/lib/presupuesto-duplicar";
import type { PresupuestoCompleto } from "@/lib/presupuesto-repo";

/** Un presupuesto ya enviado, con una línea verificada y otra que no. */
function original(): PresupuestoCompleto {
  const linea = {
    id: "l1",
    opcionId: "o1",
    orden: 1,
    tipo: "PRODUCTO",
    concepto: "Botella de acero inoxidable 500 ml",
    descripcion: "Acero 18/8",
    referencia: "STM-10022",
    imagenUrl: "/api/m/abc",
    cantidad: 500,
    costeUnitCents: 615,
    costeVerificado: true,
    margenPct: 22,
    pvpUnitCents: 800,
  };
  return {
    id: "p1",
    numero: "PRE-2026-0001",
    anio: 2026,
    secuencia: 1,
    estado: "ENVIADO",
    asunto: "Botellas para la feria",
    clienteNombre: "Tus Territorios",
    clienteContacto: "Jose",
    clienteReferencia: "Ref. contacto: Club Cámara",
    clienteCif: null,
    clienteDireccion: null,
    clienteEmail: null,
    validezDias: 30,
    plazoMinDias: 8,
    plazoMaxDias: 15,
    margenObjetivoPct: 30,
    notaTecnicaTitulo: "Sobre la tinta",
    notaTecnica: "El grabado láser no lleva tinta.",
    cierreTexto: "Quedamos a la espera.",
    produccionCentroEspecialEmpleo: true,
    condiciones: [{ titulo: "Pago", texto: "100 % a la confirmación." }],
    createdBy: "demo@startidea.es",
    enviadoAt: new Date("2026-03-01T10:00:00Z"),
    createdAt: new Date("2026-03-01T09:00:00Z"),
    updatedAt: new Date("2026-03-01T10:00:00Z"),
    partidas: [
      {
        id: "pa1",
        presupuestoId: "p1",
        orden: 1,
        titulo: "500 botellas",
        descripcion: "Con grabado láser",
        opciones: [
          {
            id: "o1",
            partidaId: "pa1",
            orden: 1,
            nombre: "única",
            recomendada: true,
            fotoProductoUrl: "/files/presupuestos/foto.jpg",
            fotoMarcajeUrl: null,
            medidas: "70 × 70 × 250 mm",
            materiales: "Acero inoxidable 18/8",
            incluye: null,
            usoRecomendado: null,
            marcajeTecnica: "Grabado láser",
            marcajeTintas: null,
            marcajePosicion: "CUERPO",
            marcajeAreaMaxima: "60 × 80 mm",
            marcajeFormatoArte: null,
            lineas: [linea, { ...linea, id: "l2", orden: 2, costeVerificado: false }],
          },
        ],
      },
    ],
  } as unknown as PresupuestoCompleto;
}

describe("entradaDuplicada", () => {
  it("la copia nace en borrador", () => {
    // Nadie la ha mandado todavía; heredar «ENVIADO» sellaría una fecha de
    // envío que no ha ocurrido.
    expect(entradaDuplicada(original()).estado).toBe("BORRADOR");
  });

  it("TODOS los costes quedan sin verificar, también los que lo estaban", () => {
    // Es lo que hace segura la copia: la tarifa de hace seis meses no es la de
    // hoy, y el encargo dice que el precio se mira en el portal.
    const lineas = entradaDuplicada(original()).partidas[0].opciones[0].lineas;
    expect(lineas).toHaveLength(2);
    expect(lineas.every((l) => l.costeVerificado === false)).toBe(true);
  });

  it("copia el asunto tal cual, sin marcarlo como copia", () => {
    // Un «(copia)» en el asunto acaba impreso en el documento del cliente si
    // a alguien se le olvida quitarlo.
    expect(entradaDuplicada(original()).asunto).toBe("Botellas para la feria");
  });

  it("se lleva el cliente, los plazos, las notas y las condiciones", () => {
    const copia = entradaDuplicada(original());
    expect(copia.clienteNombre).toBe("Tus Territorios");
    expect(copia.clienteReferencia).toBe("Ref. contacto: Club Cámara");
    expect(copia.validezDias).toBe(30);
    expect(copia.plazoMinDias).toBe(8);
    expect(copia.notaTecnica).toBe("El grabado láser no lleva tinta.");
    expect(copia.condiciones).toEqual([{ titulo: "Pago", texto: "100 % a la confirmación." }]);
  });

  it("mantiene la casilla de impacto social tal como estaba", () => {
    // Si era verdad en aquel pedido puede no serlo en éste, pero desmarcarla
    // sola escondería una decisión que la persona debe volver a tomar.
    expect(entradaDuplicada(original()).produccionCentroEspecialEmpleo).toBe(true);
  });

  it("conserva la estructura, las fichas técnicas y los márgenes por línea", () => {
    const copia = entradaDuplicada(original());
    const opcion = copia.partidas[0].opciones[0];
    expect(copia.partidas[0].titulo).toBe("500 botellas");
    expect(opcion.recomendada).toBe(true);
    expect(opcion.marcajeAreaMaxima).toBe("60 × 80 mm");
    expect(opcion.lineas[0].margenPct).toBe(22);
    expect(opcion.lineas[0].pvpUnitCents).toBe(800);
  });
});
