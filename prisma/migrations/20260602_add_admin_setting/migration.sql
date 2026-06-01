-- Migration: AdminSetting — key/value config

CREATE TABLE IF NOT EXISTS "AdminSetting" (
    "key"       TEXT NOT NULL,
    "value"     JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("key")
);
