-- Migration: NEWSLETTER_TAG audience + audienceTags[] en EmailBroadcast
-- Permite enviar broadcasts a subscribers filtrados por tags específicos
-- (las listas que importas vía Excel con un tag por hoja).

-- 1. Añadir valor NEWSLETTER_TAG al enum BroadcastAudience
ALTER TYPE "BroadcastAudience" ADD VALUE IF NOT EXISTS 'NEWSLETTER_TAG';

-- 2. Añadir columna audienceTags[] a EmailBroadcast
ALTER TABLE "EmailBroadcast"
  ADD COLUMN IF NOT EXISTS "audienceTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
