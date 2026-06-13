-- Agente 24h de propuestas: campos de dedup para el cron auto-proposal.
ALTER TABLE "CartQuote" ADD COLUMN IF NOT EXISTS "autoProposalAt" TIMESTAMP(3);
ALTER TABLE "CartQuote" ADD COLUMN IF NOT EXISTS "autoProposalId" TEXT;
