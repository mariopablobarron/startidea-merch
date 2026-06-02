-- Migration: IncomingWebhookEvent

CREATE TABLE IF NOT EXISTS "IncomingWebhookEvent" (
    "id"          TEXT NOT NULL,
    "source"      TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "payload"     JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncomingWebhookEvent_createdAt_idx"
  ON "IncomingWebhookEvent"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "IncomingWebhookEvent_source_type_idx"
  ON "IncomingWebhookEvent"("source", "type");
