-- Migration: añadir Cifra como proveedor + su PriceTier source
-- Ampliar enums idempotente (ADD VALUE IF NOT EXISTS, Postgres 12+).
ALTER TYPE "SupplierCode" ADD VALUE IF NOT EXISTS 'cifra';
ALTER TYPE "PriceTierSource" ADD VALUE IF NOT EXISTS 'CIFRA_PRICELIST';
