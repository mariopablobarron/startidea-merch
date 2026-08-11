-- Tarifa ABSOLUTA escalonada opcional en SupplierMarkingRule.
-- Cuando tier1UnitCents no es NULL, tiene prioridad sobre markupPct
-- (ver comentario en schema.prisma).
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier1MinQty" INTEGER;
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier1UnitCents" INTEGER;
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier2MinQty" INTEGER;
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier2UnitCents" INTEGER;
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier3MinQty" INTEGER;
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier3UnitCents" INTEGER;
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier4MinQty" INTEGER;
ALTER TABLE "SupplierMarkingRule" ADD COLUMN "tier4UnitCents" INTEGER;
