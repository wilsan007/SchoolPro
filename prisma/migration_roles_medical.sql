-- ============================================================
-- Migration : rôles SUPERVISOR/SUBJECT_LEAD + modèles médicaux
-- Date : 2026-08-14
-- Description :
--   1. Ajout de deux valeurs à l'enum Role : SUPERVISOR, SUBJECT_LEAD
--   2. Création de la table passages_infirmerie (passages à l'infirmerie)
--   3. Création de la table fiches_sanitaires (fiches santé par élève)
--   4. Index et clés étrangères
--
-- ⚠️ NON APPLIQUÉE AUTOMATIQUEMENT — confirmation utilisateur requise.
-- ============================================================

-- 1. Extension de l'enum Role
-- `ADD VALUE` ne supporte pas `IF NOT EXISTS` sur toutes les versions de
-- PostgreSQL. Si les valeurs existent déjà, ces lignes échoueront en erreur
-- mineur (non fatale) — les tables et index ci-dessous restent valides.
ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE 'SUBJECT_LEAD';

-- 2. Table passages_infirmerie
CREATE TABLE IF NOT EXISTS "passages_infirmerie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "motif" TEXT NOT NULL,
    "soin" TEXT,
    "suite" TEXT NOT NULL,
    "retourCours" BOOLEAN NOT NULL DEFAULT true,
    "dureeMin" INTEGER,
    "infirmierId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passages_infirmerie_pkey" PRIMARY KEY ("id")
);

-- 3. Table fiches_sanitaires
CREATE TABLE IF NOT EXISTS "fiches_sanitaires" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "allergies" TEXT[],
    "traitements" JSONB,
    "contreIndicationsSport" BOOLEAN NOT NULL DEFAULT false,
    "contactsUrgence" JSONB,
    "protocoleUrgence" TEXT,
    "vaccinations" JSONB,
    "remarques" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiches_sanitaires_pkey" PRIMARY KEY ("id")
);

-- 4. Index
CREATE INDEX IF NOT EXISTS "passages_infirmerie_tenantId_idx" ON "passages_infirmerie"("tenantId");
CREATE INDEX IF NOT EXISTS "passages_infirmerie_eleveId_idx" ON "passages_infirmerie"("eleveId");
CREATE INDEX IF NOT EXISTS "passages_infirmerie_siteId_idx" ON "passages_infirmerie"("siteId");

CREATE UNIQUE INDEX IF NOT EXISTS "fiches_sanitaires_eleveId_key" ON "fiches_sanitaires"("eleveId");
CREATE INDEX IF NOT EXISTS "fiches_sanitaires_tenantId_idx" ON "fiches_sanitaires"("tenantId");
CREATE INDEX IF NOT EXISTS "fiches_sanitaires_eleveId_idx" ON "fiches_sanitaires"("eleveId");

-- 5. Clés étrangères
ALTER TABLE "passages_infirmerie"
  ADD CONSTRAINT "passages_infirmerie_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passages_infirmerie"
  ADD CONSTRAINT "passages_infirmerie_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "passages_infirmerie"
  ADD CONSTRAINT "passages_infirmerie_eleveId_fkey"
  FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passages_infirmerie"
  ADD CONSTRAINT "passages_infirmerie_infirmierId_fkey"
  FOREIGN KEY ("infirmierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiches_sanitaires"
  ADD CONSTRAINT "fiches_sanitaires_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fiches_sanitaires"
  ADD CONSTRAINT "fiches_sanitaires_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiches_sanitaires"
  ADD CONSTRAINT "fiches_sanitaires_eleveId_fkey"
  FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
