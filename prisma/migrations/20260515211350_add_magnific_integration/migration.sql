-- AlterEnum: añadir MAGNIFIC al enum IntegrationProvider
ALTER TYPE "IntegrationProvider" ADD VALUE 'MAGNIFIC';

-- CreateTable: MagnificTask (historial async upscale/remove-bg/mystic/etc)
CREATE TABLE "MagnificTask" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputUrl" TEXT,
    "outputUrl" TEXT,
    "previewUrl" TEXT,
    "remoteTaskId" TEXT,
    "prompt" TEXT,
    "params" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "MagnificTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MagnificTask_type_status_idx" ON "MagnificTask"("type", "status");
CREATE INDEX "MagnificTask_createdAt_idx" ON "MagnificTask"("createdAt");
