-- Migration: extender NewsletterSubscriber + crear NewsletterImport
-- Permite importar subscribers desde Excel/CSV con tags + tracking de batch.

-- 1. NewsletterImport (tabla nueva)
CREATE TABLE IF NOT EXISTS "NewsletterImport" (
    "id"            TEXT NOT NULL,
    "filename"      TEXT NOT NULL,
    "importedBy"    TEXT NOT NULL,
    "tag"           TEXT NOT NULL,
    "totalRows"     INTEGER NOT NULL DEFAULT 0,
    "insertedRows"  INTEGER NOT NULL DEFAULT 0,
    "updatedRows"   INTEGER NOT NULL DEFAULT 0,
    "skippedRows"   INTEGER NOT NULL DEFAULT 0,
    "errorsJson"    JSONB,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NewsletterImport_createdAt_idx"
  ON "NewsletterImport"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "NewsletterImport_tag_idx"
  ON "NewsletterImport"("tag");

-- 2. Extender NewsletterSubscriber con nuevos campos
ALTER TABLE "NewsletterSubscriber"
  ADD COLUMN IF NOT EXISTS "phone"         TEXT,
  ADD COLUMN IF NOT EXISTS "tags"          TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "meta"          JSONB,
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT;

-- FK NewsletterSubscriber.importBatchId → NewsletterImport.id (SET NULL on delete)
DO $$ BEGIN
  ALTER TABLE "NewsletterSubscriber"
    ADD CONSTRAINT "NewsletterSubscriber_importBatchId_fkey"
    FOREIGN KEY ("importBatchId") REFERENCES "NewsletterImport"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Índices nuevos para queries de "subscribers por tag" y "subscribers de un batch"
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_importBatchId_idx"
  ON "NewsletterSubscriber"("importBatchId");
-- GIN sobre tags[] para WHERE 'lista-X' = ANY(tags)
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_tags_idx"
  ON "NewsletterSubscriber" USING GIN ("tags");
