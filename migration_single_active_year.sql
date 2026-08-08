-- Migration: Une seule année active par tenant + index unique partiel
-- ============================================================

-- 1. Index unique partiel : une seule année active par tenant
CREATE UNIQUE INDEX IF NOT EXISTS annees_scolaires_unique_current
  ON annees_scolaires ("tenantId")
  WHERE "isCurrent" = true;

-- 2. Index unique partiel : une seule période active par année
CREATE UNIQUE INDEX IF NOT EXISTS periodes_unique_current
  ON periodes ("anneeId")
  WHERE "isCurrent" = true;
