-- Migration: Soft-delete for Sites + Audit log table
-- Adds deletedAt, deletedBy, deletedReason, scheduledPurgeAt to sites table
-- Creates site_deletion_logs table for permanent audit trail

-- 1. Add soft-delete columns to sites table
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledPurgeAt" TIMESTAMP(3);

-- 2. Create site_deletion_logs table
CREATE TABLE IF NOT EXISTS "site_deletion_logs" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "siteId"          TEXT NOT NULL,
  "siteNom"         TEXT NOT NULL,
  "action"          TEXT NOT NULL,
  "reason"          TEXT,
  "performedBy"     TEXT NOT NULL,
  "performedByName" TEXT,
  "performedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata"        JSONB
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS "site_deletion_logs_tenantId_idx"
  ON "site_deletion_logs"("tenantId");

CREATE INDEX IF NOT EXISTS "site_deletion_logs_siteId_idx"
  ON "site_deletion_logs"("siteId");

-- 4. RLS policies for site_deletion_logs
ALTER TABLE "site_deletion_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_deletion_logs_tenant_isolation"
  ON "site_deletion_logs"
  USING ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY "site_deletion_logs_admin_write"
  ON "site_deletion_logs"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
