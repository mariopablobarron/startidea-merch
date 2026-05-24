-- Migration: Promotion model
-- Sistema de promociones programables aplicadas automáticamente al catálogo
-- durante la ventana startsAt → endsAt.

-- CreateEnum: PromotionKind
DO $$ BEGIN
  CREATE TYPE "PromotionKind" AS ENUM ('PERCENT', 'FIXED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum: PromotionScope
DO $$ BEGIN
  CREATE TYPE "PromotionScope" AS ENUM ('ALL', 'CATEGORY', 'BRAND', 'TAG', 'PRODUCT_LIST');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: Promotion
CREATE TABLE IF NOT EXISTS "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "kind" "PromotionKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "scope" "PromotionScope" NOT NULL,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "badgeText" TEXT,
    "badgeColor" TEXT,
    "displayInList" BOOLEAN NOT NULL DEFAULT true,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- Unique slug
CREATE UNIQUE INDEX IF NOT EXISTS "Promotion_slug_key" ON "Promotion"("slug");

-- Lookup index para "promos activas en este momento"
CREATE INDEX IF NOT EXISTS "Promotion_active_startsAt_endsAt_idx"
  ON "Promotion"("active", "startsAt", "endsAt");

-- Filtrado por scope
CREATE INDEX IF NOT EXISTS "Promotion_scope_idx" ON "Promotion"("scope");
