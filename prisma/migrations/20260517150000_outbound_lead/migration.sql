-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OutboundLeadStatus" AS ENUM (
    'NEW', 'INVITED', 'CONNECTED', 'MESSAGED', 'REPLIED',
    'MEETING_BOOKED', 'PROPOSAL_SENT', 'WON', 'LOST', 'NURTURING'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "OutboundLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "phone" TEXT,
    "segment" TEXT,
    "source" TEXT,
    "status" "OutboundLeadStatus" NOT NULL DEFAULT 'NEW',
    "lastContactAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "notes" TEXT,
    "ownerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OutboundLead_status_nextActionAt_idx" ON "OutboundLead"("status", "nextActionAt");
CREATE INDEX IF NOT EXISTS "OutboundLead_createdAt_idx" ON "OutboundLead"("createdAt" DESC);
