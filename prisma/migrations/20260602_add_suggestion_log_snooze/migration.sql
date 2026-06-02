-- Migration: SuggestionActionLog + SuggestionSnooze

CREATE TABLE IF NOT EXISTS "SuggestionActionLog" (
    "id"        TEXT NOT NULL,
    "actionId"  TEXT NOT NULL,
    "payload"   JSONB,
    "result"    JSONB,
    "appliedBy" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SuggestionActionLog_appliedAt_idx"
  ON "SuggestionActionLog"("appliedAt" DESC);
CREATE INDEX IF NOT EXISTS "SuggestionActionLog_actionId_idx"
  ON "SuggestionActionLog"("actionId");

CREATE TABLE IF NOT EXISTS "SuggestionSnooze" (
    "suggestionId"  TEXT NOT NULL,
    "snoozedUntil"  TIMESTAMP(3) NOT NULL,
    "snoozedReason" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuggestionSnooze_pkey" PRIMARY KEY ("suggestionId")
);

CREATE INDEX IF NOT EXISTS "SuggestionSnooze_snoozedUntil_idx"
  ON "SuggestionSnooze"("snoozedUntil");
