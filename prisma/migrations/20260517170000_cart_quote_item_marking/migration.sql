-- CreateTable: CartQuoteItemMarking (multi-marca por item)
CREATE TABLE IF NOT EXISTS "CartQuoteItemMarking" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "positionLabel" TEXT,
    "techniqueCode" TEXT NOT NULL,
    "techniqueName" TEXT,
    "numberOfColors" INTEGER NOT NULL DEFAULT 1,
    "manipulationCode" TEXT,
    "setupCostCents" INTEGER,
    "unitCostCents" INTEGER,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CartQuoteItemMarking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CartQuoteItemMarking_itemId_order_idx"
  ON "CartQuoteItemMarking"("itemId", "order");

-- AddForeignKey
ALTER TABLE "CartQuoteItemMarking"
  ADD CONSTRAINT "CartQuoteItemMarking_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "CartQuoteItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada CartQuoteItem con marcaje plano genera 1 row en markings.
-- Idempotente: usa NOT EXISTS para no duplicar si ya hay un row.
INSERT INTO "CartQuoteItemMarking"
  ("id", "itemId", "positionId", "techniqueCode", "techniqueName",
   "numberOfColors", "order")
SELECT
  'cqim_' || substring(md5(random()::text || i.id) FROM 1 FOR 24),
  i.id,
  i."markingPositionId",
  i."markingTechniqueCode",
  i."markingTechniqueName",
  COALESCE(i."markingColours", 1),
  0
FROM "CartQuoteItem" i
WHERE i."markingPositionId" IS NOT NULL
  AND i."markingTechniqueCode" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CartQuoteItemMarking" m WHERE m."itemId" = i.id
  );
