-- ============================================================
-- EcolPro — Migration : tokens push appareils mobiles (Capacitor)
-- À exécuter sur la base Supabase/PostgreSQL.
-- ============================================================

-- Enum plateforme
DO $$ BEGIN
  CREATE TYPE "PlatformMobile" AS ENUM ('IOS', 'ANDROID', 'WEB');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Table des tokens
CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT,
  "userId"    TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "platform"  "PlatformMobile" NOT NULL DEFAULT 'ANDROID',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "device_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_key" ON "device_tokens"("token");
CREATE INDEX IF NOT EXISTS "device_tokens_userId_idx" ON "device_tokens"("userId");
