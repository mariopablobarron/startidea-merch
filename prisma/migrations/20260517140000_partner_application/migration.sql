-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PartnerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartnerApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "audience" TEXT,
    "message" TEXT,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "approvedPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerApplication_approvedPartnerId_key" ON "PartnerApplication"("approvedPartnerId");
CREATE INDEX IF NOT EXISTS "PartnerApplication_status_idx" ON "PartnerApplication"("status");
CREATE INDEX IF NOT EXISTS "PartnerApplication_createdAt_idx" ON "PartnerApplication"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PartnerApplication"
  ADD CONSTRAINT "PartnerApplication_approvedPartnerId_fkey"
  FOREIGN KEY ("approvedPartnerId") REFERENCES "AffiliatePartner"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
