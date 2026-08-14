-- ============================================================
-- Migration : Génération automatique de comptes élèves & parents
-- ============================================================
-- 1. Ajout de mustChangePassword sur users
-- 2. Table demandes_lien_parent (self-service rattachement enfant)
-- ============================================================

-- 1. Colonne mustChangePassword sur users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- 2. Enum StatutDemandeLien
DO $$ BEGIN
  CREATE TYPE "StatutDemandeLien" AS ENUM ('EN_ATTENTE', 'VALIDE', 'REFUSE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Table demandes_lien_parent
CREATE TABLE IF NOT EXISTS "demandes_lien_parent" (
  "id"                  TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "parentId"            TEXT NOT NULL,
  "eleveId"             TEXT NOT NULL,
  "matriculeSaisi"      TEXT NOT NULL,
  "dateNaissanceSaisie" TIMESTAMP(3) NOT NULL,
  "statut"              "StatutDemandeLien" NOT NULL DEFAULT 'EN_ATTENTE',
  "traitePar"           TEXT,
  "traiteLe"            TIMESTAMP(3),
  "motifRefus"          TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "demandes_lien_parent_pkey" PRIMARY KEY ("id")
);

-- Contrainte d'unicité : une seule demande par couple parent↔élève
CREATE UNIQUE INDEX IF NOT EXISTS "demandes_lien_parent_parentId_eleveId_key"
  ON "demandes_lien_parent"("parentId", "eleveId");

-- Index
CREATE INDEX IF NOT EXISTS "demandes_lien_parent_tenantId_idx"
  ON "demandes_lien_parent"("tenantId");
CREATE INDEX IF NOT EXISTS "demandes_lien_parent_statut_idx"
  ON "demandes_lien_parent"("statut");

-- Clés étrangères
ALTER TABLE "demandes_lien_parent"
  ADD CONSTRAINT "demandes_lien_parent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "demandes_lien_parent"
  ADD CONSTRAINT "demandes_lien_parent_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE;

ALTER TABLE "demandes_lien_parent"
  ADD CONSTRAINT "demandes_lien_parent_eleveId_fkey"
  FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE;
