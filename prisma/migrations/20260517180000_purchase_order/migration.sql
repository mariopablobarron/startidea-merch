-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PurchaseOrderStatus" AS ENUM (
    'PENDING', 'PLACED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELED', 'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "supplier" "SupplierCode" NOT NULL,
    "supplierOrderRef" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalClientCents" INTEGER NOT NULL DEFAULT 0,
    "estimatedDeliveryDate" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "trackingCarrier" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "placedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- AddColumn (CartQuoteItem.purchaseOrderId)
ALTER TABLE "CartQuoteItem"
  ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_cartId_idx" ON "PurchaseOrder"("cartId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplier_idx" ON "PurchaseOrder"("supplier");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CartQuoteItem_purchaseOrderId_idx" ON "CartQuoteItem"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "CartQuote"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartQuoteItem"
  ADD CONSTRAINT "CartQuoteItem_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
