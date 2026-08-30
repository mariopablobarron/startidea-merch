-- CreateEnum
CREATE TYPE "MarkingPriceMode" AS ENUM ('ONE_COLOR', 'FULL_COLOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BroadcastAudience" ADD VALUE 'NEWSLETTER_ENGAGED';
ALTER TYPE "BroadcastAudience" ADD VALUE 'NEWSLETTER_DORMANT';
ALTER TYPE "BroadcastAudience" ADD VALUE 'NEWSLETTER_SOURCE';

-- AlterEnum
ALTER TYPE "CartQuoteStatus" ADD VALUE 'LOST';

-- DropIndex
DROP INDEX "Proposal_sentAt_idx";

-- AlterTable
ALTER TABLE "AdminSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "BroadcastDelivery" ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clickedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CartQuote" ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "paymentLinkExpiresAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CartQuoteItemMarking" ADD COLUMN     "printAreaCm2" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CustomerUser" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "EmailBroadcast" ADD COLUMN     "audienceSource" TEXT;

-- AlterTable
ALTER TABLE "Experiment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MarkingPriceScale" ADD COLUMN     "minUnitCents" INTEGER,
ADD COLUMN     "perCm2" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductView" ALTER COLUMN "lastViewedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "cartQuoteId" TEXT,
ADD COLUMN     "followupCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFollowupAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RecommenderQuery" ADD COLUMN     "mode" TEXT,
ADD COLUMN     "quoteItems" JSONB,
ADD COLUMN     "quoteTotalCents" INTEGER;

-- AlterTable
ALTER TABLE "ReferrerLog" ALTER COLUMN "lastSeenAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "SearchAlias" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VoiceSession" ADD COLUMN     "transcript" JSONB;

-- CreateTable
CREATE TABLE "ProductMarkingPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" "MarkingPriceMode" NOT NULL,
    "maxAreaCm" TEXT,
    "tier1MinQty" INTEGER NOT NULL,
    "tier1Cents" INTEGER NOT NULL,
    "tier2MinQty" INTEGER NOT NULL,
    "tier2Cents" INTEGER NOT NULL,
    "tier3MinQty" INTEGER NOT NULL,
    "tier3Cents" INTEGER NOT NULL,
    "tier4MinQty" INTEGER NOT NULL,
    "tier4Cents" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cifra-pdf-2026',
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMarkingPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLoginEvent" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "includesMarking" BOOLEAN NOT NULL DEFAULT false,
    "technique" TEXT,
    "matchConfidence" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdminMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdminMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFavorite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSyncRun" (
    "id" TEXT NOT NULL,
    "supplier" "SupplierCode" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "productsFetched" INTEGER NOT NULL DEFAULT 0,
    "productsUpserted" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductMarkingPrice_productId_idx" ON "ProductMarkingPrice"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMarkingPrice_productId_mode_key" ON "ProductMarkingPrice"("productId", "mode");

-- CreateIndex
CREATE INDEX "AdminLoginEvent_createdAt_idx" ON "AdminLoginEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CompetitorPrice_productId_fetchedAt_idx" ON "CompetitorPrice"("productId", "fetchedAt");

-- CreateIndex
CREATE INDEX "TelegramAdminMessage_chatId_createdAt_idx" ON "TelegramAdminMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFavorite_email_idx" ON "CustomerFavorite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerFavorite_email_productId_key" ON "CustomerFavorite"("email", "productId");

-- CreateIndex
CREATE INDEX "SupplierSyncRun_supplier_startedAt_idx" ON "SupplierSyncRun"("supplier", "startedAt");

-- CreateIndex
CREATE INDEX "CartQuote_paymentLinkSentAt_idx" ON "CartQuote"("paymentLinkSentAt");

-- CreateIndex
CREATE INDEX "Proposal_sentAt_idx" ON "Proposal"("sentAt");

-- CreateIndex
CREATE INDEX "Proposal_cartQuoteId_idx" ON "Proposal"("cartQuoteId");

-- CreateIndex
CREATE INDEX "RecommenderQuery_mode_idx" ON "RecommenderQuery"("mode");

-- AddForeignKey
ALTER TABLE "ProductMarkingPrice" ADD CONSTRAINT "ProductMarkingPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPrice" ADD CONSTRAINT "CompetitorPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_email_fkey" FOREIGN KEY ("email") REFERENCES "CustomerUser"("email") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
