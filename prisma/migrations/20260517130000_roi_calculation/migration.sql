-- CreateTable: RoiCalculation (lead capture · calculadora ROI RSC)
CREATE TABLE IF NOT EXISTS "RoiCalculation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "employees" INTEGER NOT NULL,
    "annualBudgetEur" INTEGER NOT NULL,
    "substitutionPct" INTEGER NOT NULL,
    "co2SavedKg" INTEGER NOT NULL,
    "workHoursDignified" INTEGER NOT NULL,
    "ceeProductionPct" INTEGER NOT NULL,
    "treesEquivalent" INTEGER NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoiCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoiCalculation_email_idx" ON "RoiCalculation"("email");
CREATE INDEX IF NOT EXISTS "RoiCalculation_createdAt_idx" ON "RoiCalculation"("createdAt" DESC);
