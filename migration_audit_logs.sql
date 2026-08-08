-- Migration: Création de la table audit_logs
-- ============================================================

CREATE TYPE audit_verdict AS ENUM ('ALLOWED', 'DENIED');

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  "tenantId"  TEXT,
  "userId"    TEXT,
  action      TEXT NOT NULL,
  verdict     audit_verdict NOT NULL,
  resource    TEXT,
  "resourceId" TEXT,
  reason      TEXT,
  metadata    JSONB,
  ip          TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenantId ON audit_logs ("tenantId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs ("userId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_verdict ON audit_logs (verdict);
CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs ("createdAt");
