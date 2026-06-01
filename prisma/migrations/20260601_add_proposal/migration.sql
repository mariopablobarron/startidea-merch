-- Migration: Proposal — propuesta de cotización enviada por email + PDF
-- Vinculada opcionalmente a una RecommenderQuery origen.

-- 1. Tabla Proposal
CREATE TABLE IF NOT EXISTS "Proposal" (
    "id"                  TEXT NOT NULL,
    "proposalNumber"      TEXT NOT NULL,
    "email"               TEXT NOT NULL,
    "name"                TEXT,
    "company"             TEXT,
    "quoteItems"          JSONB NOT NULL,
    "subtotalCents"       INTEGER NOT NULL,
    "ivaCents"            INTEGER NOT NULL,
    "totalCents"          INTEGER NOT NULL,
    "recommenderQueryId"  TEXT,
    "status"              TEXT NOT NULL DEFAULT 'sent',
    "sentAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt"            TIMESTAMP(3),
    "acceptedAt"          TIMESTAMP(3),
    "ip"                  TEXT,
    "ua"                  TEXT,
    "resendId"            TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- 2. Unique proposalNumber
CREATE UNIQUE INDEX IF NOT EXISTS "Proposal_proposalNumber_key"
  ON "Proposal"("proposalNumber");

-- 3. Indexes
CREATE INDEX IF NOT EXISTS "Proposal_email_idx"
  ON "Proposal"("email");
CREATE INDEX IF NOT EXISTS "Proposal_sentAt_idx"
  ON "Proposal"("sentAt" DESC);
CREATE INDEX IF NOT EXISTS "Proposal_status_idx"
  ON "Proposal"("status");
CREATE INDEX IF NOT EXISTS "Proposal_recommenderQueryId_idx"
  ON "Proposal"("recommenderQueryId");

-- 4. FK opcional a RecommenderQuery
DO $$ BEGIN
  ALTER TABLE "Proposal"
    ADD CONSTRAINT "Proposal_recommenderQueryId_fkey"
    FOREIGN KEY ("recommenderQueryId") REFERENCES "RecommenderQuery"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
