-- Migration: SearchAlias — admin redirige queries del navbar

CREATE TABLE IF NOT EXISTS "SearchAlias" (
    "id"          TEXT NOT NULL,
    "queryLower"  TEXT NOT NULL,
    "redirectTo"  TEXT NOT NULL,
    "description" TEXT,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "hitCount"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SearchAlias_queryLower_key"
  ON "SearchAlias"("queryLower");
CREATE INDEX IF NOT EXISTS "SearchAlias_active_idx"
  ON "SearchAlias"("active");
