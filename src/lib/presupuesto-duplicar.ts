/**
 * Duplicar un presupuesto.
 *
 * El caso real: «lo mismo que el año pasado, pero 500 en vez de 300». Volver
 * a teclear catorce líneas para cambiar una cantidad es donde se cuelan las
 * erratas, y donde se pierde media tarde.
 *
 * ── Los costes de la copia nacen SIN CONFIRMAR ──────────────────────────────
 * Y no es una precaución de más. Un presupuesto de hace seis meses lleva los
 * costes de hace seis meses: el proveedor ha revisado tarifa, el tramo era
 * otro y el cliché ha subido. Copiarlos como buenos es exactamente lo que el
 * encargo prohíbe —los precios se miran en el portal a la cantidad exacta—,
 * así que la copia sale entera en ámbar y no se puede marcar como enviada sin
 * pasar por el aviso. Lo que se hereda es el trabajo de redactarla; los
 * números hay que volver a mirarlos.
 *
 * El resto se copia tal cual, incluido el asunto: añadirle un «(copia)» sería
 * añadir un texto que acaba impreso en el documento del cliente si a alguien
 * se le olvida quitarlo.
 */

import type { PresupuestoCompleto, PresupuestoEntrada } from "@/lib/presupuesto-repo";
import type { TipoLinea } from "@/lib/presupuesto-calculo";

export function entradaDuplicada(p: PresupuestoCompleto): PresupuestoEntrada {
  return {
    asunto: p.asunto,
    // Una copia siempre empieza en borrador: no se ha mandado a nadie.
    estado: "BORRADOR",
    clienteNombre: p.clienteNombre,
    clienteContacto: p.clienteContacto,
    clienteReferencia: p.clienteReferencia,
    clienteCif: p.clienteCif,
    clienteDireccion: p.clienteDireccion,
    clienteEmail: p.clienteEmail,
    validezDias: p.validezDias,
    plazoMinDias: p.plazoMinDias,
    plazoMaxDias: p.plazoMaxDias,
    margenObjetivoPct: p.margenObjetivoPct,
    notaTecnicaTitulo: p.notaTecnicaTitulo,
    notaTecnica: p.notaTecnica,
    cierreTexto: p.cierreTexto,
    produccionCentroEspecialEmpleo: p.produccionCentroEspecialEmpleo,
    condiciones: (p.condiciones as PresupuestoEntrada["condiciones"]) ?? null,
    partidas: p.partidas.map((partida) => ({
      titulo: partida.titulo,
      descripcion: partida.descripcion,
      opciones: partida.opciones.map((opcion) => ({
        nombre: opcion.nombre,
        recomendada: opcion.recomendada,
        fotoProductoUrl: opcion.fotoProductoUrl,
        fotoMarcajeUrl: opcion.fotoMarcajeUrl,
        medidas: opcion.medidas,
        materiales: opcion.materiales,
        incluye: opcion.incluye,
        usoRecomendado: opcion.usoRecomendado,
        marcajeTecnica: opcion.marcajeTecnica,
        marcajeTintas: opcion.marcajeTintas,
        marcajePosicion: opcion.marcajePosicion,
        marcajeAreaMaxima: opcion.marcajeAreaMaxima,
        marcajeFormatoArte: opcion.marcajeFormatoArte,
        lineas: opcion.lineas.map((linea) => ({
          tipo: linea.tipo as TipoLinea,
          concepto: linea.concepto,
          descripcion: linea.descripcion,
          referencia: linea.referencia,
          imagenUrl: linea.imagenUrl,
          cantidad: linea.cantidad,
          costeUnitCents: linea.costeUnitCents,
          // Ver la cabecera: la tarifa de hace seis meses no es la de hoy.
          costeVerificado: false,
          margenPct: linea.margenPct,
          pvpUnitCents: linea.pvpUnitCents,
        })),
      })),
    })),
  };
}
