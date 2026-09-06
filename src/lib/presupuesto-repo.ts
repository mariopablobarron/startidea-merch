/**
 * Lectura y escritura de presupuestos. La capa que traduce entre las tablas y
 * el documento.
 *
 * El editor guarda el presupuesto ENTERO en cada guardado: partidas, opciones y
 * líneas se reemplazan dentro de una transacción. Con un documento de veinte
 * líneas que se edita a mano, sincronizar altas, bajas y reordenaciones una a
 * una es más código y más formas de dejar el documento a medias; reemplazar es
 * atómico y no puede dejar una línea huérfana con un importe que ya no cuadra.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, PresupuestoEstado } from "@prisma/client";
import { siguienteNumero } from "@/lib/presupuesto-numero";
import {
  calcularEscenarios,
  type Escenario,
  type TipoLinea,
} from "@/lib/presupuesto-calculo";
import type { PresupuestoRender } from "@/lib/presupuesto-html";

export const PRESUPUESTO_INCLUDE = {
  partidas: {
    orderBy: { orden: "asc" },
    include: {
      opciones: {
        orderBy: { orden: "asc" },
        include: { lineas: { orderBy: { orden: "asc" } } },
      },
    },
  },
} satisfies Prisma.PresupuestoInclude;

export type PresupuestoCompleto = Prisma.PresupuestoGetPayload<{
  include: typeof PRESUPUESTO_INCLUDE;
}>;

/** Lo que manda el editor al guardar. */
export type PresupuestoEntrada = {
  asunto: string;
  estado?: PresupuestoEstado;
  clienteNombre: string;
  clienteContacto?: string | null;
  clienteReferencia?: string | null;
  clienteCif?: string | null;
  clienteDireccion?: string | null;
  clienteEmail?: string | null;
  validezDias: number;
  plazoMinDias: number;
  plazoMaxDias: number;
  margenObjetivoPct: number;
  notaTecnicaTitulo?: string | null;
  notaTecnica?: string | null;
  cierreTexto?: string | null;
  produccionCentroEspecialEmpleo: boolean;
  condiciones?: Array<{ titulo: string; texto: string }> | null;
  partidas: Array<{
    titulo: string;
    descripcion?: string | null;
    opciones: Array<{
      nombre: string;
      recomendada: boolean;
      fotoProductoUrl?: string | null;
      fotoMarcajeUrl?: string | null;
      medidas?: string | null;
      materiales?: string | null;
      incluye?: string | null;
      usoRecomendado?: string | null;
      marcajeTecnica?: string | null;
      marcajeTintas?: string | null;
      marcajePosicion?: string | null;
      marcajeAreaMaxima?: string | null;
      marcajeFormatoArte?: string | null;
      lineas: Array<{
        tipo: TipoLinea;
        concepto: string;
        descripcion?: string | null;
        referencia?: string | null;
        imagenUrl?: string | null;
        cantidad: number;
        costeUnitCents: number;
        costeVerificado?: boolean;
        margenPct?: number | null;
        pvpUnitCents: number;
      }>;
    }>;
  }>;
};

function campos(entrada: PresupuestoEntrada) {
  return {
    asunto: entrada.asunto,
    clienteNombre: entrada.clienteNombre,
    clienteContacto: entrada.clienteContacto ?? null,
    clienteReferencia: entrada.clienteReferencia ?? null,
    clienteCif: entrada.clienteCif ?? null,
    clienteDireccion: entrada.clienteDireccion ?? null,
    clienteEmail: entrada.clienteEmail ?? null,
    validezDias: entrada.validezDias,
    plazoMinDias: entrada.plazoMinDias,
    plazoMaxDias: entrada.plazoMaxDias,
    margenObjetivoPct: entrada.margenObjetivoPct,
    notaTecnicaTitulo: entrada.notaTecnicaTitulo ?? null,
    notaTecnica: entrada.notaTecnica ?? null,
    cierreTexto: entrada.cierreTexto ?? null,
    produccionCentroEspecialEmpleo: entrada.produccionCentroEspecialEmpleo,
    condiciones: (entrada.condiciones ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

function partidasAnidadas(entrada: PresupuestoEntrada) {
  return entrada.partidas.map((partida, iPartida) => ({
    orden: iPartida + 1,
    titulo: partida.titulo,
    descripcion: partida.descripcion ?? null,
    opciones: {
      create: partida.opciones.map((opcion, iOpcion) => ({
        orden: iOpcion + 1,
        nombre: opcion.nombre,
        recomendada: opcion.recomendada,
        fotoProductoUrl: opcion.fotoProductoUrl ?? null,
        fotoMarcajeUrl: opcion.fotoMarcajeUrl ?? null,
        medidas: opcion.medidas ?? null,
        materiales: opcion.materiales ?? null,
        incluye: opcion.incluye ?? null,
        usoRecomendado: opcion.usoRecomendado ?? null,
        marcajeTecnica: opcion.marcajeTecnica ?? null,
        marcajeTintas: opcion.marcajeTintas ?? null,
        marcajePosicion: opcion.marcajePosicion ?? null,
        marcajeAreaMaxima: opcion.marcajeAreaMaxima ?? null,
        marcajeFormatoArte: opcion.marcajeFormatoArte ?? null,
        lineas: {
          create: opcion.lineas.map((linea, iLinea) => ({
            orden: iLinea + 1,
            tipo: linea.tipo,
            concepto: linea.concepto,
            descripcion: linea.descripcion ?? null,
            referencia: linea.referencia ?? null,
            imagenUrl: linea.imagenUrl ?? null,
            cantidad: linea.cantidad,
            costeUnitCents: linea.costeUnitCents,
            costeVerificado: linea.costeVerificado ?? true,
            margenPct: linea.margenPct ?? null,
            pvpUnitCents: linea.pvpUnitCents,
          })),
        },
      })),
    },
  }));
}

export async function crearPresupuesto(
  entrada: PresupuestoEntrada,
  createdBy?: string | null,
): Promise<PresupuestoCompleto> {
  return prisma.$transaction(async (tx) => {
    // El número se reserva DENTRO de la transacción: si el insert falla, el
    // número no se quema y no queda un hueco en la serie.
    const { numero, anio, secuencia } = await siguienteNumero(tx as never);
    return tx.presupuesto.create({
      data: {
        numero,
        anio,
        secuencia,
        createdBy: createdBy ?? null,
        ...campos(entrada),
        partidas: { create: partidasAnidadas(entrada) },
      },
      include: PRESUPUESTO_INCLUDE,
    });
  });
}

export async function actualizarPresupuesto(
  id: string,
  entrada: PresupuestoEntrada,
): Promise<PresupuestoCompleto> {
  return prisma.$transaction(async (tx) => {
    // `enviadoAt` se sella UNA vez. El editor manda el estado en cada guardado,
    // así que con un `new Date()` a secas la fecha de envío se reescribía cada
    // vez que se tocaba una coma de un presupuesto ya enviado: el documento
    // diría que se mandó hoy, y la validez de 30 días se contaría desde el
    // último retoque en vez de desde el envío.
    const actual = await tx.presupuesto.findUnique({
      where: { id },
      select: { enviadoAt: true },
    });
    const selloDeEnvio =
      entrada.estado === "ENVIADO" && !actual?.enviadoAt ? { enviadoAt: new Date() } : {};

    await tx.presupuestoPartida.deleteMany({ where: { presupuestoId: id } });
    return tx.presupuesto.update({
      where: { id },
      data: {
        ...campos(entrada),
        ...(entrada.estado ? { estado: entrada.estado } : {}),
        ...selloDeEnvio,
        partidas: { create: partidasAnidadas(entrada) },
      },
      include: PRESUPUESTO_INCLUDE,
    });
  });
}

export function obtenerPresupuesto(id: string) {
  return prisma.presupuesto.findUnique({ where: { id }, include: PRESUPUESTO_INCLUDE });
}

export function listarPresupuestos(estado?: PresupuestoEstado) {
  return prisma.presupuesto.findMany({
    where: estado ? { estado } : {},
    orderBy: [{ anio: "desc" }, { secuencia: "desc" }],
    include: PRESUPUESTO_INCLUDE,
    take: 200,
  });
}

/** Fila de BD → datos del documento. */
export function presupuestoARender(p: PresupuestoCompleto): PresupuestoRender {
  return {
    numero: p.numero,
    fecha: p.createdAt,
    asunto: p.asunto,
    clienteNombre: p.clienteNombre,
    clienteContacto: p.clienteContacto,
    clienteReferencia: p.clienteReferencia,
    clienteCif: p.clienteCif,
    clienteDireccion: p.clienteDireccion,
    validezDias: p.validezDias,
    plazoMinDias: p.plazoMinDias,
    plazoMaxDias: p.plazoMaxDias,
    notaTecnicaTitulo: p.notaTecnicaTitulo,
    notaTecnica: p.notaTecnica,
    cierreTexto: p.cierreTexto,
    produccionCentroEspecialEmpleo: p.produccionCentroEspecialEmpleo,
    condiciones: Array.isArray(p.condiciones)
      ? (p.condiciones as Array<{ titulo: string; texto: string }>)
      : null,
    partidas: p.partidas.map((partida) => ({
      id: partida.id,
      orden: partida.orden,
      titulo: partida.titulo,
      descripcion: partida.descripcion,
      opciones: partida.opciones.map((opcion) => ({
        id: opcion.id,
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
          pvpUnitCents: linea.pvpUnitCents,
        })),
      })),
    })),
  };
}

/** Los totales que ve Mario en el listado: coste, venta y margen. */
export function resumenPresupuesto(p: PresupuestoCompleto): Escenario[] {
  return calcularEscenarios(
    p.partidas.map((partida) => ({
      id: partida.id,
      titulo: partida.titulo,
      opciones: partida.opciones.map((opcion) => ({
        id: opcion.id,
        nombre: opcion.nombre,
        recomendada: opcion.recomendada,
        lineas: opcion.lineas.map((linea) => ({
          tipo: linea.tipo as TipoLinea,
          cantidad: linea.cantidad,
          costeUnitCents: linea.costeUnitCents,
          pvpUnitCents: linea.pvpUnitCents,
        })),
      })),
    })),
  );
}
