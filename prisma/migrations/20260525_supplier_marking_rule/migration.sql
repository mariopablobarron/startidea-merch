-- Cierra el hueco histórico del commit de Cifra, que añadió este modelo y
-- dos columnas al schema pero sólo versionó la ampliación de enums. Esta
-- migración permite reconstruir desde una base vacía sin depender de db push.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "markingSizeHint" TEXT,
ADD COLUMN "markingTechniqueHint" TEXT;

-- CreateTable
CREATE TABLE "SupplierMarkingRule" (
    "id" TEXT NOT NULL,
    "supplier" "SupplierCode" NOT NULL,
    "techniqueCode" TEXT NOT NULL,
    "techniqueLabel" TEXT NOT NULL,
    "markupPct" INTEGER NOT NULL,
    "setupCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierMarkingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierMarkingRule_supplier_active_idx" ON "SupplierMarkingRule"("supplier", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierMarkingRule_supplier_techniqueCode_key" ON "SupplierMarkingRule"("supplier", "techniqueCode");
