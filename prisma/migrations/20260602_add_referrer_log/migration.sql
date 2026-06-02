-- Migration: ReferrerLog — agregado de visitas por host externo

CREATE TABLE IF NOT EXISTS "ReferrerLog" (
    "id"          TEXT NOT NULL,
    "host"        TEXT NOT NULL,
    "path"        TEXT,
    "visits"      INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferrerLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferrerLog_host_key"
  ON "ReferrerLog"("host");
CREATE INDEX IF NOT EXISTS "ReferrerLog_visits_idx"
  ON "ReferrerLog"("visits" DESC);
CREATE INDEX IF NOT EXISTS "ReferrerLog_lastSeenAt_idx"
  ON "ReferrerLog"("lastSeenAt" DESC);
