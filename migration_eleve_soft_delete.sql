-- Migration: Add deletedAt column to eleves table for soft delete
-- Best practice (PowerSchool, Infinite Campus, Eduka): never hard-delete student records
-- Soft delete preserves all historical data (grades, attendance, billing) for compliance
--
-- NOTE: This column was already added via `prisma db push`.
-- This migration is kept for documentation purposes and is idempotent.

-- Add column only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'eleves' AND column_name = 'deletedAt') THEN
    ALTER TABLE "eleves" ADD COLUMN "deletedAt" TIMESTAMP(3);
  END IF;
END $$;

-- Index for filtering out soft-deleted records in queries
CREATE INDEX IF NOT EXISTS "eleves_deletedAt_idx" ON "eleves"("deletedAt");
