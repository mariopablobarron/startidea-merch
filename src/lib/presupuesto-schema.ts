/**
 * Validación de lo que manda el editor.
 *
 * El presupuesto acaba en un PDF que se envía a un cliente y en unos importes
 * que se cobran: aquí se cierra la puerta a una cantidad negativa, a un margen
 * del 300 % o a un plazo al revés (mínimo mayor que máximo), que es lo que
 * produce documentos absurdos.
 */
import { z } from "zod";

const texto = z.string().trim();
const textoOpcional = texto.max(4000).optional().nullable();

export const lineaSchema = z.object({
  tipo: z.enum(["PRODUCTO", "MARCAJE", "CLICHE", "OTRO"]),
  concepto: texto.min(1, "La línea necesita un concepto").max(300),
  descripcion: textoOpcional,
  referencia: texto.max(60).optional().nullable(),
  imagenUrl: texto.max(2000).optional().nullable(),
  cantidad: z.number().int().min(1, "La cantidad mínima es 1").max(10_000_000),
  costeUnitCents: z.number().int().min(0).max(100_000_000),
  costeVerificado: z.boolean().optional(),
  margenPct: z.number().min(0).max(94.9).optional().nullable(),
  pvpUnitCents: z.number().int().min(0).max(100_000_000),
});

export const opcionSchema = z.object({
  nombre: texto.min(1).max(120),
  recomendada: z.boolean(),
  fotoProductoUrl: texto.max(2000).optional().nullable(),
  fotoMarcajeUrl: texto.max(2000).optional().nullable(),
  medidas: textoOpcional,
  materiales: textoOpcional,
  incluye: textoOpcional,
  usoRecomendado: textoOpcional,
  marcajeTecnica: textoOpcional,
  marcajeTintas: textoOpcional,
  marcajePosicion: textoOpcional,
  marcajeAreaMaxima: textoOpcional,
  marcajeFormatoArte: textoOpcional,
  lineas: z.array(lineaSchema).max(60),
});

export const partidaSchema = z.object({
  titulo: texto.min(1, "La partida necesita un título").max(200),
  descripcion: textoOpcional,
  opciones: z.array(opcionSchema).min(1, "Toda partida tiene al menos una opción").max(4),
});

export const presupuestoSchema = z
  .object({
    asunto: texto.min(1, "El presupuesto necesita un asunto").max(300),
    estado: z.enum(["BORRADOR", "ENVIADO", "ACEPTADO", "CADUCADO"]).optional(),
    clienteNombre: texto.min(1, "Falta el nombre del cliente").max(200),
    clienteContacto: texto.max(200).optional().nullable(),
    clienteReferencia: texto.max(200).optional().nullable(),
    clienteCif: texto.max(40).optional().nullable(),
    clienteDireccion: textoOpcional,
    clienteEmail: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
    validezDias: z.number().int().min(1).max(365),
    plazoMinDias: z.number().int().min(1).max(365),
    plazoMaxDias: z.number().int().min(1).max(365),
    margenObjetivoPct: z.number().min(0).max(94.9),
    notaTecnicaTitulo: texto.max(200).optional().nullable(),
    notaTecnica: textoOpcional,
    cierreTexto: textoOpcional,
    produccionCentroEspecialEmpleo: z.boolean(),
    condiciones: z
      .array(z.object({ titulo: texto.min(1).max(120), texto: texto.min(1).max(2000) }))
      .max(20)
      .optional()
      .nullable(),
    partidas: z.array(partidaSchema).max(20),
  })
  .refine((p) => p.plazoMinDias <= p.plazoMaxDias, {
    message: "El plazo mínimo no puede ser mayor que el máximo",
    path: ["plazoMinDias"],
  });

export const margenesSchema = z.object({
  pordefecto: z.number().min(0).max(94.9),
  familias: z.record(z.string().trim().min(1).max(80), z.number().min(0).max(94.9)),
});

export type PresupuestoEntradaValidada = z.infer<typeof presupuestoSchema>;
