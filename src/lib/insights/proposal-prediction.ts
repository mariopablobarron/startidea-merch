/**
 * Heurística de probabilidad de cierre de una propuesta.
 *
 * Sin modelo ML — solo señales observables:
 *   1. ¿Email corporativo o gratuito? (corp +15%)
 *   2. ¿Misma empresa ya pidió antes? (+30% si sí)
 *   3. ¿Cliente abrió el PDF? (+25% si openedAt)
 *   4. ¿Total es realista para la media histórica? (penaliza outliers)
 *   5. ¿Días desde envío? (decae después de 15 días)
 *
 * Devuelve probabilidad 0-100 + breakdown de las señales.
 */
import { prisma } from "@/lib/prisma";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "yahoo.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "msn.com",
  "yopmail.com",
]);

export type PredictionSignals = {
  emailCorp: boolean;
  isRepeat: boolean;
  pdfOpened: boolean;
  totalRealistic: "normal" | "small" | "large";
  daysSinceSent: number;
};

export type ProposalPrediction = {
  probability: number; // 0-100
  signals: PredictionSignals;
  notes: string[];
};

export async function predictProposalClose(proposalId: string): Promise<ProposalPrediction | null> {
  const p = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      email: true,
      totalCents: true,
      sentAt: true,
      openedAt: true,
      status: true,
    },
  });
  if (!p) return null;

  const notes: string[] = [];
  let prob = 35; // baseline B2B cold

  // 1. Email corporativo
  const domain = p.email.split("@")[1]?.toLowerCase() ?? "";
  const emailCorp = !FREE_EMAIL_DOMAINS.has(domain);
  if (emailCorp) {
    prob += 15;
    notes.push("Email corporativo (+15)");
  } else {
    notes.push("Email gratuito (gmail/hotmail) — baseline");
  }

  // 2. ¿Misma empresa repite?
  const previous = await prisma.proposal.count({
    where: {
      OR: [
        { email: p.email },
        domain && !FREE_EMAIL_DOMAINS.has(domain) ? { email: { endsWith: `@${domain}` } } : {},
      ].filter(Boolean) as object[],
      id: { not: proposalId },
    },
  });
  const isRepeat = previous > 0;
  if (isRepeat) {
    prob += 25;
    notes.push(`Empresa ya pidió antes (${previous} props previas, +25)`);
  }

  // 3. PDF abierto
  const pdfOpened = !!p.openedAt;
  if (pdfOpened) {
    prob += 20;
    notes.push("Cliente abrió el PDF (+20)");
  }

  // 4. Total razonable
  const aggregate = await prisma.proposal.aggregate({
    where: { id: { not: proposalId } },
    _avg: { totalCents: true },
    _count: true,
  });
  const avg = aggregate._avg.totalCents ?? p.totalCents;
  const ratio = avg > 0 ? p.totalCents / avg : 1;
  let totalRealistic: PredictionSignals["totalRealistic"] = "normal";
  if (ratio > 5) {
    totalRealistic = "large";
    prob -= 12;
    notes.push(`Total ${ratio.toFixed(1)}× la media — propuestas grandes cierran menos (-12)`);
  } else if (ratio < 0.3) {
    totalRealistic = "small";
    prob -= 5;
    notes.push("Total pequeño — riesgo de prueba o aborto (-5)");
  }

  // 5. Decay temporal
  const daysSinceSent = Math.floor(
    (Date.now() - p.sentAt.getTime()) / (24 * 3600_000),
  );
  if (daysSinceSent > 15) {
    const penalty = Math.min(25, (daysSinceSent - 15) * 2);
    prob -= penalty;
    notes.push(`Hace ${daysSinceSent} días — propuesta envejece (-${penalty})`);
  }

  // Si ya está aceptada, prob real es 100
  if (p.status === "accepted") {
    return {
      probability: 100,
      signals: { emailCorp, isRepeat, pdfOpened, totalRealistic, daysSinceSent },
      notes: ["Status = accepted (100%)"],
    };
  }

  // Si status = rejected, prob 0
  if (p.status === "rejected") {
    return {
      probability: 0,
      signals: { emailCorp, isRepeat, pdfOpened, totalRealistic, daysSinceSent },
      notes: ["Status = rejected (0%)"],
    };
  }

  // Clamp 5-95 para no dar nunca certezas absolutas
  const final = Math.max(5, Math.min(95, Math.round(prob)));
  return {
    probability: final,
    signals: { emailCorp, isRepeat, pdfOpened, totalRealistic, daysSinceSent },
    notes,
  };
}

/**
 * Versión batch — para el listado /admin/propuestas.
 */
export async function predictProposalsBatch(
  proposalIds: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  await Promise.all(
    proposalIds.map(async (id) => {
      const p = await predictProposalClose(id);
      if (p) result[id] = p.probability;
    }),
  );
  return result;
}
