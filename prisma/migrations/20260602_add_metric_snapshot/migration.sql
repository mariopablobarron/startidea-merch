-- Migration: MetricSnapshot + ErrorEvent

CREATE TABLE IF NOT EXISTS "MetricSnapshot" (
    "date"                  DATE NOT NULL,
    "views30d"              INTEGER NOT NULL DEFAULT 0,
    "cartAdds30d"           INTEGER NOT NULL DEFAULT 0,
    "recommenderQueries30d" INTEGER NOT NULL DEFAULT 0,
    "proposals30d"          INTEGER NOT NULL DEFAULT 0,
    "activeProducts"        INTEGER NOT NULL DEFAULT 0,
    "variantsWithStock"     INTEGER NOT NULL DEFAULT 0,
    "cartConvPct"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proposalConvPct"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("date")
);

CREATE INDEX IF NOT EXISTS "MetricSnapshot_date_idx"
  ON "MetricSnapshot"("date" DESC);

CREATE TABLE IF NOT EXISTS "ErrorEvent" (
    "id"        TEXT NOT NULL,
    "message"   TEXT NOT NULL,
    "stack"     TEXT,
    "context"   TEXT,
    "severity"  TEXT NOT NULL DEFAULT 'error',
    "url"       TEXT,
    "userAgent" TEXT,
    "resolved"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ErrorEvent_createdAt_idx"
  ON "ErrorEvent"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ErrorEvent_severity_resolved_idx"
  ON "ErrorEvent"("severity", "resolved");
