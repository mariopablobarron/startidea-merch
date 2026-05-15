-- AlterEnum: añadir REPLICATE al enum IntegrationProvider
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'REPLICATE';

-- CreateTable: ReplicateTask (historial async predicciones Replicate)
CREATE TABLE IF NOT EXISTS "ReplicateTask" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputUrl" TEXT,
    "outputUrl" TEXT,
    "remotePredictionId" TEXT,
    "prompt" TEXT,
    "params" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "ReplicateTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReplicateTask_type_status_idx" ON "ReplicateTask"("type", "status");
CREATE INDEX IF NOT EXISTS "ReplicateTask_createdAt_idx" ON "ReplicateTask"("createdAt");
