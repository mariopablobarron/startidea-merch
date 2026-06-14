-- Estadísticas de campaña (aperturas) + lead scoring.
ALTER TABLE "BroadcastDelivery" ADD COLUMN IF NOT EXISTS "resendId" TEXT;
ALTER TABLE "BroadcastDelivery" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3);
ALTER TABLE "BroadcastDelivery" ADD COLUMN IF NOT EXISTS "openCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "BroadcastDelivery_resendId_idx" ON "BroadcastDelivery"("resendId");
ALTER TABLE "NewsletterSubscriber" ADD COLUMN IF NOT EXISTS "engagementScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NewsletterSubscriber" ADD COLUMN IF NOT EXISTS "lastOpenedAt" TIMESTAMP(3);
