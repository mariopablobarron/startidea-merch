CREATE TABLE "HubIntakeOutbox" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubIntakeOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HubIntakeOutbox_submissionId_key"
    ON "HubIntakeOutbox"("submissionId");

CREATE INDEX "HubIntakeOutbox_deliveredAt_nextAttemptAt_lockedAt_idx"
    ON "HubIntakeOutbox"("deliveredAt", "nextAttemptAt", "lockedAt");
