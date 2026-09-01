import { describe, expect, it } from "vitest";
import {
  clienteDelCarrito,
  direccionDelCarrito,
  entradaDesdeCarrito,
  entradaDesdeSolicitud,
  type ContactoCarrito,
  type ItemResuelto,
} from "@/lib/presupuesto-desde-carrito";

const CONTACTO: ContactoCarrito = {
  name: "Jose Ruiz",
  company: "Tus Territorios",
  email: "jose@tusterritorios.es",
  vatNumber: "B12345678",
  shippingAddress: "C/ Mayor 3",
  shippingPostalCode: "18001",
  shippingCity: "Granada",
};

const BOTELLA: ItemResuelto = {
  productName: "Botella de acero inoxidable 500 ml",
  quantity: 500,
  imagenUrl: "/api/m/abc",
  referencia: "STM-10022",
  medidas: "70 × 70 × 250 mm",
  materiales: "Acero inoxidable 18/8",
  costeUnitCents: 615,
  margenPct: 22,
  marcaje: {
    codigo: "SERI",
    nombre: "Serigrafía",
    costeUnitCents: 74,
    clicheCents: 3500,
    areaCm2: 48,
    tintas: 2,
    posicion: "CUERPO",
    areaMaxima: "60 × 80 mm",
    aviso: null,
  },
};

const pvp = (coste: number, margen: number) => Math.round(coste / (1 - margen / 100));

const base = {
  contacto: CONTACTO,
  margenObjetivoPct: 30,
  validezDias: 30,
  plazoMinDias: 8,
  plazoMaxDias: 15,
  pvp,
};

describe("clienteDelCarrito", () => {
  it("el cliente es la empresa y la persona pasa a contacto", () => {
    // El presupuesto se dirige a quien factura.
    expect(clienteDelCarrito(CONTACTO)).toEqual({
      clienteNombre: "Tus Territorios",
      clienteContacto: "Jose Ruiz",
    });
  });

  it("sin empresa, el cliente es la persona y el contacto se deja vacío", () => {
    expect(clienteDelCarrito({ ...CONTACTO, company: null })).toEqual({
      clienteNombre: "Jose Ruiz",
      clienteContacto: "",
    });
    // Una empresa en blanco es lo mismo que no tenerla.
    expect(clienteDelCarrito({ ...CONTACTO, company: "   " }).clienteNombre).toBe("Jose Ruiz");
  });
});

describe("direccionDelCarrito", () => {
  it("junta calle, código postal y ciudad", () => {
    expect(direccionDelCarrito(CONTACTO)).toBe("C/ Mayor 3, 18001 Granada");
  });

  it("con los campos a medias no inventa comas sueltas", () => {
    expect(
      direccionDelCarrito({ ...CONTACTO, shippingAddress: null, shippingPostalCode: null }),
    ).toBe("Granada");
    expect(
      direccionDelCarrito({
        ...CONTACTO,
        shippingAddress: null,
        shippingPostalCode: null,
        shippingCity: null,
      }),
    ).toBe("");
  });
});

describe("entradaDesdeCarrito", () => {
  it("una partida por línea del carrito, con su opción única", () => {
    const entrada = entradaDesdeCarrito({ ...base, items: [BOTELLA, { ...BOTELLA, productName: "Bolsa" }] });
    expect(entrada.partidas).toHaveLength(2);
    expect(entrada.partidas[0].titulo).toBe("Botella de acero inoxidable 500 ml");
    expect(entrada.partidas[0].opciones).toHaveLength(1);
    expect(entrada.partidas[0].opciones[0].recomendada).toBe(true);
  });

  it("producto, marcaje y cliché, cada uno con su tipo", () => {
    const lineas = entradaDesdeCarrito({ ...base, items: [BOTELLA] }).partidas[0].opciones[0].lineas;
    expect(lineas.map((l) => l.tipo)).toEqual(["PRODUCTO", "MARCAJE", "CLICHE"]);
    expect(lineas[0].cantidad).toBe(500);
    expect(lineas[1].cantidad).toBe(500);
    // El cliché es un cargo único, no un coste por unidad.
    expect(lineas[2].cantidad).toBe(1);
  });

  it("NINGÚN coste llega verificado: el precio se mira en el portal", () => {
    const lineas = entradaDesdeCarrito({ ...base, items: [BOTELLA] }).partidas[0].opciones[0].lineas;
    expect(lineas.every((l) => l.costeVerificado === false)).toBe(true);
  });

  it("no hereda el precio que el cliente vio en la web", () => {
    // El PVP se recalcula al margen de la familia sobre el coste del catálogo.
    // 6,15 € ÷ 0,78 = 7,88 €.
    const lineas = entradaDesdeCarrito({ ...base, items: [BOTELLA] }).partidas[0].opciones[0].lineas;
    expect(lineas[0].pvpUnitCents).toBe(788);
    expect(lineas[0].margenPct).toBe(22);
  });

  it("sin marcaje, la partida es solo el producto", () => {
    const lineas = entradaDesdeCarrito({
      ...base,
      items: [{ ...BOTELLA, marcaje: null }],
    }).partidas[0].opciones[0].lineas;
    expect(lineas.map((l) => l.tipo)).toEqual(["PRODUCTO"]);
    expect(lineas[0].pvpUnitCents).toBe(788);
  });

  it("una técnica sin cliché no crea la línea del cliché", () => {
    // El grabado láser no lleva pantalla.
    const sinCliche = { ...BOTELLA, marcaje: { ...BOTELLA.marcaje!, clicheCents: 0 } };
    const lineas = entradaDesdeCarrito({ ...base, items: [sinCliche] }).partidas[0].opciones[0].lineas;
    expect(lineas.map((l) => l.tipo)).toEqual(["PRODUCTO", "MARCAJE"]);
  });

  it("un producto sin tarifa entra a cero, con su nombre y su cantidad", () => {
    // Perder el precio es recuperable; perder la partida entera, no.
    const huerfano: ItemResuelto = {
      ...BOTELLA,
      costeUnitCents: null,
      marcaje: null,
      margenPct: 30,
    };
    const linea = entradaDesdeCarrito({ ...base, items: [huerfano] }).partidas[0].opciones[0].lineas[0];
    expect(linea.costeUnitCents).toBe(0);
    expect(linea.pvpUnitCents).toBe(0);
    expect(linea.cantidad).toBe(500);
    expect(linea.costeVerificado).toBe(false);
  });

  it("la ficha técnica sale del producto y del marcaje elegido", () => {
    const opcion = entradaDesdeCarrito({ ...base, items: [BOTELLA] }).partidas[0].opciones[0];
    expect(opcion.medidas).toBe("70 × 70 × 250 mm");
    expect(opcion.marcajeTecnica).toBe("Serigrafía");
    expect(opcion.marcajeTintas).toBe("2");
    expect(opcion.marcajeAreaMaxima).toBe("60 × 80 mm");
  });

  it("propone asunto con un solo producto y lo deja en blanco con varios", () => {
    expect(entradaDesdeCarrito({ ...base, items: [BOTELLA] }).asunto).toBe(
      "Botella de acero inoxidable 500 ml",
    );
    expect(entradaDesdeCarrito({ ...base, items: [BOTELLA, BOTELLA] }).asunto).toBe("");
  });

  it("nace en borrador y con los datos fiscales del carrito", () => {
    const entrada = entradaDesdeCarrito({ ...base, items: [BOTELLA] });
    expect(entrada.estado).toBe("BORRADOR");
    expect(entrada.clienteCif).toBe("B12345678");
    expect(entrada.clienteDireccion).toBe("C/ Mayor 3, 18001 Granada");
    // La casilla de impacto social nunca se marca sola.
    expect(entrada.produccionCentroEspecialEmpleo).toBe(false);
  });
});

describe("entradaDesdeSolicitud", () => {
  const solicitud = {
    name: "Ana Gil",
    company: "Club Cámara",
    email: "ana@clubcamara.es",
    productHint: "Bolsas de algodón para la feria",
    quantity: 300,
  };

  it("deja el cliente puesto y una partida abierta con lo que pidió", () => {
    const entrada = entradaDesdeSolicitud(solicitud, 30);
    expect(entrada.clienteNombre).toBe("Club Cámara");
    expect(entrada.clienteContacto).toBe("Ana Gil");
    expect(entrada.asunto).toBe("Bolsas de algodón para la feria");
    expect(entrada.partidas[0].titulo).toBe("Bolsas de algodón para la feria");
    expect(entrada.partidas[0].opciones[0].lineas[0].cantidad).toBe(300);
  });

  it("no cotiza nada: la línea sale vacía para rellenarla con el buscador", () => {
    const linea = entradaDesdeSolicitud(solicitud, 30).partidas[0].opciones[0].lineas[0];
    expect(linea.concepto).toBe("");
    expect(linea.costeUnitCents).toBe(0);
    // Y nace verificada: la teclea una persona mirando el portal.
    expect(linea.costeVerificado).toBe(true);
  });

  it("sin pista ni cantidad, pone una partida con nombre y 100 uds", () => {
    const entrada = entradaDesdeSolicitud(
      { ...solicitud, productHint: null, quantity: null },
      30,
    );
    expect(entrada.asunto).toBe("");
    expect(entrada.partidas[0].titulo).toBe("Partida 1");
    expect(entrada.partidas[0].opciones[0].lineas[0].cantidad).toBe(100);
  });
});
