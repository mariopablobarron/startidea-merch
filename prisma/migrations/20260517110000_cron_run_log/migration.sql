-- CreateTable: CronRunLog — histórico de invocaciones de crons
CREATE TABLE IF NOT EXISTS "CronRunLog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "response" TEXT,
    "error" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',

    CONSTRAINT "CronRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CronRunLog_name_startedAt_idx" ON "CronRunLog"("name", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "CronRunLog_startedAt_idx" ON "CronRunLog"("startedAt" DESC);
