-- Migration: Experiment + ExperimentEvent

CREATE TABLE IF NOT EXISTS "Experiment" (
    "id"          TEXT NOT NULL,
    "slug"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "active"      BOOLEAN NOT NULL DEFAULT false,
    "variants"    JSONB NOT NULL,
    "startedAt"   TIMESTAMP(3),
    "endedAt"     TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Experiment_slug_key"
  ON "Experiment"("slug");
CREATE INDEX IF NOT EXISTS "Experiment_active_idx"
  ON "Experiment"("active");

CREATE TABLE IF NOT EXISTS "ExperimentEvent" (
    "id"           TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantKey"   TEXT NOT NULL,
    "event"        TEXT NOT NULL,
    "anonId"       TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExperimentEvent_experimentId_variantKey_event_idx"
  ON "ExperimentEvent"("experimentId", "variantKey", "event");
CREATE INDEX IF NOT EXISTS "ExperimentEvent_createdAt_idx"
  ON "ExperimentEvent"("createdAt");

DO $$ BEGIN
  ALTER TABLE "ExperimentEvent"
    ADD CONSTRAINT "ExperimentEvent_experimentId_fkey"
    FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
