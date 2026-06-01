-- Migration: ProductView — contadores agregados de interacción cliente↔producto

CREATE TABLE IF NOT EXISTS "ProductView" (
    "productId"        TEXT NOT NULL,
    "viewCount"        INTEGER NOT NULL DEFAULT 0,
    "cartAddCount"     INTEGER NOT NULL DEFAULT 0,
    "proposalCount"    INTEGER NOT NULL DEFAULT 0,
    "recommenderCount" INTEGER NOT NULL DEFAULT 0,
    "view30d"          INTEGER NOT NULL DEFAULT 0,
    "cartAdd30d"       INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCartAddAt"    TIMESTAMP(3),

    CONSTRAINT "ProductView_pkey" PRIMARY KEY ("productId")
);

CREATE INDEX IF NOT EXISTS "ProductView_viewCount_idx"
  ON "ProductView"("viewCount" DESC);
CREATE INDEX IF NOT EXISTS "ProductView_view30d_idx"
  ON "ProductView"("view30d" DESC);
CREATE INDEX IF NOT EXISTS "ProductView_lastViewedAt_idx"
  ON "ProductView"("lastViewedAt" DESC);

DO $$ BEGIN
  ALTER TABLE "ProductView"
    ADD CONSTRAINT "ProductView_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
