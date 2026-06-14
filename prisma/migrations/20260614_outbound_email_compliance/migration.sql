-- Fase 3: email frío B2B compliant — supresión + campos de tracking/opt-out.
ALTER TABLE "OutboundLead" ADD COLUMN IF NOT EXISTS "legalBasis" TEXT DEFAULT 'interes-legitimo-b2b';
ALTER TABLE "OutboundLead" ADD COLUMN IF NOT EXISTS "unsubToken" TEXT;
ALTER TABLE "OutboundLead" ADD COLUMN IF NOT EXISTS "lastEmailedAt" TIMESTAMP(3);
ALTER TABLE "OutboundLead" ADD COLUMN IF NOT EXISTS "emailsSent" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundLead_unsubToken_key" ON "OutboundLead"("unsubToken");

CREATE TABLE IF NOT EXISTS "OutboundSuppression" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboundSuppression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OutboundSuppression_email_key" ON "OutboundSuppression"("email");
CREATE INDEX IF NOT EXISTS "OutboundSuppression_createdAt_idx" ON "OutboundSuppression"("createdAt" DESC);
