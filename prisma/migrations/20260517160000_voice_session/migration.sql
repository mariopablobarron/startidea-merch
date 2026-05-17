-- CreateTable: VoiceSession (agente conversacional ElevenLabs)
CREATE TABLE IF NOT EXISTS "VoiceSession" (
    "id" TEXT NOT NULL,
    "elevenLabsConversationId" TEXT,
    "visitorAnonId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "estimatedCostCents" INTEGER,
    "toolsCalled" JSONB,
    "productSlugsDiscussed" TEXT[] NOT NULL DEFAULT '{}',
    "resultingCartId" TEXT,
    "userAgent" TEXT,
    "sourceUrl" TEXT,

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceSession_elevenLabsConversationId_key"
  ON "VoiceSession"("elevenLabsConversationId");
CREATE INDEX IF NOT EXISTS "VoiceSession_startedAt_idx"
  ON "VoiceSession"("startedAt" DESC);
CREATE INDEX IF NOT EXISTS "VoiceSession_resultingCartId_idx"
  ON "VoiceSession"("resultingCartId");

-- AddForeignKey
ALTER TABLE "VoiceSession"
  ADD CONSTRAINT "VoiceSession_resultingCartId_fkey"
  FOREIGN KEY ("resultingCartId") REFERENCES "CartQuote"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
