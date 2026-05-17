-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MockupRequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MockupRequest" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "productSlug" TEXT NOT NULL,
    "positionId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "brief" TEXT,
    "logoUrl" TEXT,
    "status" "MockupRequestStatus" NOT NULL DEFAULT 'NEW',
    "sourceUrl" TEXT,
    "notes" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MockupRequest_status_idx" ON "MockupRequest"("status");
CREATE INDEX IF NOT EXISTS "MockupRequest_productId_idx" ON "MockupRequest"("productId");
CREATE INDEX IF NOT EXISTS "MockupRequest_createdAt_idx" ON "MockupRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "MockupRequest"
  ADD CONSTRAINT "MockupRequest_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
