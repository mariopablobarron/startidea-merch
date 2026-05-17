-- CreateTable: ProcessedStripeEvent — idempotencia de webhooks
CREATE TABLE IF NOT EXISTS "ProcessedStripeEvent" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessedStripeEvent_processedAt_idx" ON "ProcessedStripeEvent"("processedAt" DESC);
