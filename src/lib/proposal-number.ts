import { prisma } from "@/lib/prisma";

/**
 * Genera proposalNumber en formato PROP-YYYY-NNNN secuencial por año.
 *
 * Usa advisory lock de PostgreSQL para garantizar atomicidad — dos
 * requests simultáneos no pueden colisionar.
 *
 * Lock id: 9_710 (arbitrario, único en el codebase para este propósito).
 *
 * Si no hay propuestas previas en el año, empieza en 0001.
 */
const ADVISORY_LOCK_ID = 9710;

export async function generateProposalNumber(now: Date = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = `PROP-${year}-`;

  return await prisma.$transaction(async (tx) => {
    // Bloquear sección crítica para evitar colisiones concurrentes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_ID})`;

    // Encontrar el número más alto del año actual.
    const lastProposal = await tx.proposal.findFirst({
      where: { proposalNumber: { startsWith: prefix } },
      orderBy: { proposalNumber: "desc" },
      select: { proposalNumber: true },
    });

    let nextSeq = 1;
    if (lastProposal) {
      const match = lastProposal.proposalNumber.match(/PROP-\d{4}-(\d+)$/);
      if (match) {
        nextSeq = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  });
}
