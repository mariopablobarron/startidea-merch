-- Migration: AffiliateLedger + cupones con afiliado vinculado
-- Sistema dual COMMISSION + CREDIT por canje (decisión Mario 25-may).

-- 1. Enum AffiliateLedgerKind
DO $$ BEGIN
  CREATE TYPE "AffiliateLedgerKind" AS ENUM (
    'COMMISSION', 'CREDIT', 'PAYOUT', 'CREDIT_USED', 'ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. AffiliatePartner.creditPct (% que se acumula como crédito para el afiliado)
ALTER TABLE "AffiliatePartner"
  ADD COLUMN IF NOT EXISTS "creditPct" INTEGER NOT NULL DEFAULT 0;

-- 3. AffiliateLedgerEntry (append-only ledger)
CREATE TABLE IF NOT EXISTS "AffiliateLedgerEntry" (
    "id"          TEXT NOT NULL,
    "partnerId"   TEXT NOT NULL,
    "kind"        "AffiliateLedgerKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cartId"      TEXT,
    "couponId"    TEXT,
    "createdBy"   TEXT,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLedgerEntry_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "AffiliateLedgerEntry"
    ADD CONSTRAINT "AffiliateLedgerEntry_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "AffiliatePartner"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "AffiliateLedgerEntry_partnerId_kind_idx"
  ON "AffiliateLedgerEntry"("partnerId", "kind");
CREATE INDEX IF NOT EXISTS "AffiliateLedgerEntry_createdAt_idx"
  ON "AffiliateLedgerEntry"("createdAt" DESC);

-- 4. Coupon ← AffiliatePartner (vínculo opcional) + overrides %
ALTER TABLE "Coupon"
  ADD COLUMN IF NOT EXISTS "affiliateId"            TEXT,
  ADD COLUMN IF NOT EXISTS "commissionPctOverride"  INTEGER,
  ADD COLUMN IF NOT EXISTS "creditPctOverride"      INTEGER;

DO $$ BEGIN
  ALTER TABLE "Coupon"
    ADD CONSTRAINT "Coupon_affiliateId_fkey"
    FOREIGN KEY ("affiliateId") REFERENCES "AffiliatePartner"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "Coupon_affiliateId_idx" ON "Coupon"("affiliateId");
