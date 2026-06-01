-- Migration: SearchQuery — log queries del navbar para detectar demanda

CREATE TABLE IF NOT EXISTS "SearchQuery" (
    "id"           TEXT NOT NULL,
    "query"        TEXT NOT NULL,
    "queryLower"   TEXT NOT NULL,
    "resultsCount" INTEGER NOT NULL DEFAULT 0,
    "ip"           TEXT,
    "ua"           TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SearchQuery_queryLower_idx"
  ON "SearchQuery"("queryLower");
CREATE INDEX IF NOT EXISTS "SearchQuery_createdAt_idx"
  ON "SearchQuery"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SearchQuery_resultsCount_idx"
  ON "SearchQuery"("resultsCount");
