-- Migration: añadir Adivin como proveedor de catálogo (banderas/displays).
-- Adivin no tiene API: catálogo importado vía scripts/import-adivin.ts.
-- Precios manuales desde tarifa de distribuidor → PriceTierSource MANUAL_OVERRIDE.
-- Idempotente (ADD VALUE IF NOT EXISTS, Postgres 12+).
ALTER TYPE "SupplierCode" ADD VALUE IF NOT EXISTS 'adivin';
