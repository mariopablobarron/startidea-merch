import { prisma } from "@/lib/prisma";

/**
 * Número correlativo del presupuesto: PRE-AAAA-NNNN, reiniciado cada año.
 *
 * Mismo patrón que `generateProposalNumber` —advisory lock de PostgreSQL— pero
 * con su propio id de lock y contando sobre la columna `secuencia`, que es
 * numérica: ordenar por el texto del número funciona hasta el 9999 y falla en
 * silencio a partir de ahí.
 *
 * Lock id 9711 (el 9710 es el de las propuestas).
 */
const ADVISORY_LOCK_ID = 9711;

export type NumeroPresupuesto = { numero: string; anio: number; secuencia: number };

export function formatearNumero(anio: number, secuencia: number): string {
  return `PRE-${anio}-${String(secuencia).padStart(4, "0")}`;
}

/**
 * Reserva el siguiente número del año. Se llama DENTRO de la transacción que
 * crea el presupuesto (`tx`), para que un fallo al insertar no queme el número.
 */
export async function siguienteNumero(
  tx: Pick<typeof prisma, "$executeRaw" | "presupuesto">,
  now: Date = new Date(),
): Promise<NumeroPresupuesto> {
  const anio = now.getUTCFullYear();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_ID})`;

  const ultimo = await tx.presupuesto.findFirst({
    where: { anio },
    orderBy: { secuencia: "desc" },
    select: { secuencia: true },
  });

  const secuencia = (ultimo?.secuencia ?? 0) + 1;
  return { numero: formatearNumero(anio, secuencia), anio, secuencia };
}
