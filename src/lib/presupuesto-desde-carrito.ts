/**
 * De un carrito de cotización a un presupuesto.
 *
 * El carrito es lo que el cliente ha configurado en la web: producto,
 * cantidad, técnica de marcaje, tintas. Hasta ahora eso se leía en
 * `/admin/cart-quotes` y se volvía a teclear entero en el editor. Es el mismo
 * trabajo dos veces y con la misma oportunidad de errata.
 *
 * ── Qué se hereda y qué no ──────────────────────────────────────────────────
 * Se hereda la ESTRUCTURA: quién es el cliente, qué productos, cuántos y con
 * qué marcaje. Una partida por línea del carrito, porque es como el cliente lo
 * ha pensado y como va a leer el documento.
 *
 * NO se hereda el precio que vio en la web. Ese precio sale del margen
 * automático del catálogo (`MARGIN_MULTIPLIER`, un 40 % sobre venta), y un
 * presupuesto se cotiza al margen del encargo con el coste mirado en el portal
 * del proveedor. Copiarlo sería arrastrar a un documento firmado un número que
 * calculó la tienda para orientar. Los costes entran del catálogo como
 * sugerencia y sin verificar, igual que en el buscador.
 *
 * Y no se copia nada del cliente al documento salvo sus datos: su mensaje y
 * sus notas son suyos, están en la ficha del carrito, y en el presupuesto
 * sobran.
 */

import type { PresupuestoEntrada } from "@/lib/presupuesto-repo";
import type { TipoLinea } from "@/lib/presupuesto-calculo";
import type { CamposLineaDesdeProducto, MarcajeParaLinea } from "@/lib/presupuesto-catalogo";
import { lineaDeCliche, lineaDeMarcaje } from "@/lib/presupuesto-catalogo";

/** Los datos de contacto y envío del carrito. */
export type ContactoCarrito = {
  name: string;
  company: string | null;
  email: string;
  vatNumber: string | null;
  shippingAddress: string | null;
  shippingPostalCode: string | null;
  shippingCity: string | null;
};

/** Una línea del carrito, ya resuelta contra el catálogo por quien llama. */
export type ItemResuelto = {
  productName: string;
  quantity: number;
  imagenUrl: string | null;
  referencia: string | null;
  /** Ficha técnica del producto, para la página 2. */
  medidas: string | null;
  materiales: string | null;
  /** Coste del tramo, en céntimos. Null si el producto ya no tiene tarifa. */
  costeUnitCents: number | null;
  /** Margen que le toca por su familia. */
  margenPct: number;
  /** Marcaje elegido en la web, ya tarificado. Null si el cliente no puso. */
  marcaje: MarcajeParaLinea | null;
};

/**
 * Nombre del cliente para el documento.
 *
 * Manda la empresa cuando la hay: el presupuesto se dirige a quien factura, y
 * la persona va debajo, en «Persona de contacto».
 */
export function clienteDelCarrito(contacto: ContactoCarrito): {
  clienteNombre: string;
  clienteContacto: string;
} {
  const empresa = contacto.company?.trim();
  return empresa
    ? { clienteNombre: empresa, clienteContacto: contacto.name }
    : { clienteNombre: contacto.name, clienteContacto: "" };
}

/** «C/ Mayor 3, 18001 Granada» a partir de los campos sueltos del carrito. */
export function direccionDelCarrito(contacto: ContactoCarrito): string {
  const cp = [contacto.shippingPostalCode, contacto.shippingCity].filter(Boolean).join(" ");
  return [contacto.shippingAddress, cp].filter((t) => t && t.trim()).join(", ");
}

/**
 * Arma el presupuesto entero: una partida por línea del carrito, con su opción
 * única y sus líneas de producto, marcaje y cliché.
 *
 * `pvp` lo pasa quien llama para no duplicar aquí la regla de redondeo.
 */
export function entradaDesdeCarrito(args: {
  contacto: ContactoCarrito;
  items: ItemResuelto[];
  margenObjetivoPct: number;
  validezDias: number;
  plazoMinDias: number;
  plazoMaxDias: number;
  pvp: (costeCents: number, margenPct: number) => number;
}): PresupuestoEntrada {
  const { contacto, items, margenObjetivoPct, pvp } = args;

  return {
    // El asunto lo escribe quien lo mande; con un producto se puede proponer,
    // con cinco cualquier resumen automático sería peor que el silencio.
    asunto: items.length === 1 ? items[0].productName : "",
    estado: "BORRADOR",
    ...clienteDelCarrito(contacto),
    clienteEmail: contacto.email || null,
    clienteCif: contacto.vatNumber,
    clienteDireccion: direccionDelCarrito(contacto) || null,
    validezDias: args.validezDias,
    plazoMinDias: args.plazoMinDias,
    plazoMaxDias: args.plazoMaxDias,
    margenObjetivoPct,
    produccionCentroEspecialEmpleo: false,
    partidas: items.map((item) => {
      // El tipo se decide AQUÍ, al construir cada línea. Deducirlo después
      // comparando el concepto con el nombre del producto es de las cosas que
      // funcionan hasta que un cliché se llama como el producto.
      const lineas: Array<CamposLineaDesdeProducto & { tipo: TipoLinea }> = [
        {
          tipo: "PRODUCTO",
          concepto: item.productName,
          referencia: item.referencia ?? "",
          imagenUrl: item.imagenUrl ?? "",
          cantidad: item.quantity,
          costeUnitCents: item.costeUnitCents ?? 0,
          // Igual que en el buscador: el catálogo no es fuente de precio.
          costeVerificado: false,
          margenPct: item.margenPct === margenObjetivoPct ? null : item.margenPct,
          pvpUnitCents: item.costeUnitCents ? pvp(item.costeUnitCents, item.margenPct) : 0,
        },
      ];
      if (item.marcaje) {
        lineas.push({
          tipo: "MARCAJE",
          ...lineaDeMarcaje(item.marcaje, item.quantity, item.margenPct, margenObjetivoPct, pvp),
        });
        // Hay técnicas —láser, DTF— que no llevan cliché.
        if (item.marcaje.clicheCents > 0) {
          lineas.push({
            tipo: "CLICHE",
            ...lineaDeCliche(item.marcaje, item.margenPct, margenObjetivoPct, pvp),
          });
        }
      }
      return {
        titulo: item.productName,
        opciones: [
          {
            nombre: "única",
            recomendada: true,
            fotoProductoUrl: item.imagenUrl,
            medidas: item.medidas,
            materiales: item.materiales,
            marcajeTecnica: item.marcaje?.nombre ?? null,
            marcajeTintas: item.marcaje ? String(item.marcaje.tintas) : null,
            marcajePosicion: item.marcaje?.posicion ?? null,
            marcajeAreaMaxima: item.marcaje?.areaMaxima ?? null,
            lineas,
          },
        ],
      };
    }),
  };
}

// ── Solicitudes de cotización ───────────────────────────────────────────────

/** Lo que trae un formulario de cotización de la web. */
export type SolicitudCotizacion = {
  name: string;
  company: string | null;
  email: string;
  productHint: string | null;
  quantity: number | null;
};

/**
 * Presupuesto en borrador a partir de una solicitud del formulario.
 *
 * Aquí no hay nada que cotizar: el cliente ha escrito un texto, no ha elegido
 * productos. Se queda el cliente puesto y una partida abierta con lo que pidió
 * y la cantidad que dio, lista para el buscador del catálogo.
 *
 * Su mensaje NO se copia. Está en la ficha de la solicitud, es suyo, y en un
 * documento que se le manda de vuelta no pinta nada.
 */
export function entradaDesdeSolicitud(
  solicitud: SolicitudCotizacion,
  margenObjetivoPct: number,
): PresupuestoEntrada {
  const pista = solicitud.productHint?.trim() || "";
  const cantidad = solicitud.quantity && solicitud.quantity > 0 ? solicitud.quantity : 100;
  const empresa = solicitud.company?.trim();

  return {
    asunto: pista,
    estado: "BORRADOR",
    clienteNombre: empresa || solicitud.name,
    clienteContacto: empresa ? solicitud.name : "",
    clienteEmail: solicitud.email || null,
    validezDias: 30,
    plazoMinDias: 8,
    plazoMaxDias: 15,
    margenObjetivoPct,
    produccionCentroEspecialEmpleo: false,
    partidas: [
      {
        titulo: pista || "Partida 1",
        opciones: [
          {
            nombre: "única",
            recomendada: true,
            lineas: [
              {
                tipo: "PRODUCTO",
                concepto: "",
                cantidad,
                costeUnitCents: 0,
                // Una línea vacía la teclea una persona mirando el portal: nace
                // verificada, como cualquier otra escrita a mano.
                costeVerificado: true,
                pvpUnitCents: 0,
              },
            ],
          },
        ],
      },
    ],
  };
}
