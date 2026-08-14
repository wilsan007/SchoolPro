-- ============================================================
-- Migration : Vague 2 (Devoir, RemplacementCours, EntretienConseiller)
--           + Vague 4 (rôles SITE_MANAGER, INSPECTOR)
-- Date : 2026-08-14
-- Description :
--   1. Ajout de deux valeurs à l'enum Role : SITE_MANAGER, INSPECTOR
--   2. Création des enums StatutDevoir, StatutRemplacement, StatutEntretien
--   3. Création de la table devoirs (cahier de textes)
--   4. Création de la table remplacements_cours (remplacements d'enseignants)
--   5. Création de la table entretiens_conseiller (entretiens CPE/conseiller)
--   6. Index et clés étrangères
--
-- ⚠️ NON APPLIQUÉE AUTOMATIQUEMENT — confirmation utilisateur requise.
-- ============================================================

-- 1. Extension de l'enum Role
-- `ADD VALUE` ne supporte pas `IF NOT EXISTS` sur toutes les versions de
-- PostgreSQL. Si les valeurs existent déjà, ces lignes échoueront en erreur
-- mineur (non fatale) — les tables et index ci-dessous restent valides.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SITE_MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'INSPECTOR';

-- 2. Création des enums de statut
DO $$ BEGIN
    CREATE TYPE "StatutDevoir" AS ENUM ('A_FAIRE', 'EN_COURS', 'RENDU', 'CORRIGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "StatutRemplacement" AS ENUM ('PROPOSE', 'VALIDE', 'REFUSE', 'EFFECTUE', 'ANNULE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "StatutEntretien" AS ENUM ('PLANIFIE', 'REALISE', 'ANNULE', 'REPORTÉ');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Table devoirs
CREATE TABLE IF NOT EXISTS "devoirs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "enseignantId" TEXT,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "dateDonne" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRendu" TIMESTAMP(3) NOT NULL,
    "statut" "StatutDevoir" NOT NULL DEFAULT 'A_FAIRE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devoirs_pkey" PRIMARY KEY ("id")
);

-- 4. Table remplacements_cours
CREATE TABLE IF NOT EXISTS "remplacements_cours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "emploiTempsId" TEXT,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "enseignantAbsentId" TEXT,
    "enseignantRemplacantId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "salle" TEXT,
    "statut" "StatutRemplacement" NOT NULL DEFAULT 'PROPOSE',
    "motifAbsence" TEXT,
    "notes" TEXT,
    "decideParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remplacements_cours_pkey" PRIMARY KEY ("id")
);

-- 5. Table entretiens_conseiller
CREATE TABLE IF NOT EXISTS "entretiens_conseiller" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "conseillerId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT NOT NULL,
    "compteRendu" TEXT,
    "decisions" TEXT,
    "suivi" TEXT,
    "statut" "StatutEntretien" NOT NULL DEFAULT 'PLANIFIE',
    "prochainRendezVous" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entretiens_conseiller_pkey" PRIMARY KEY ("id")
);

-- 6. Index — devoirs
CREATE INDEX IF NOT EXISTS "devoirs_tenantId_idx" ON "devoirs"("tenantId");
CREATE INDEX IF NOT EXISTS "devoirs_classeId_dateRendu_idx" ON "devoirs"("classeId", "dateRendu");
CREATE INDEX IF NOT EXISTS "devoirs_matiereId_idx" ON "devoirs"("matiereId");
CREATE INDEX IF NOT EXISTS "devoirs_siteId_idx" ON "devoirs"("siteId");

-- 6b. Index — remplacements_cours
CREATE INDEX IF NOT EXISTS "remplacements_cours_tenantId_idx" ON "remplacements_cours"("tenantId");
CREATE INDEX IF NOT EXISTS "remplacements_cours_date_idx" ON "remplacements_cours"("date");
CREATE INDEX IF NOT EXISTS "remplacements_cours_classeId_idx" ON "remplacements_cours"("classeId");
CREATE INDEX IF NOT EXISTS "remplacements_cours_siteId_idx" ON "remplacements_cours"("siteId");

-- 6c. Index — entretiens_conseiller
CREATE INDEX IF NOT EXISTS "entretiens_conseiller_tenantId_idx" ON "entretiens_conseiller"("tenantId");
CREATE INDEX IF NOT EXISTS "entretiens_conseiller_eleveId_date_idx" ON "entretiens_conseiller"("eleveId", "date");
CREATE INDEX IF NOT EXISTS "entretiens_conseiller_siteId_idx" ON "entretiens_conseiller"("siteId");

-- 7. Clés étrangères — devoirs
ALTER TABLE "devoirs"
  ADD CONSTRAINT "devoirs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "devoirs"
  ADD CONSTRAINT "devoirs_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "devoirs"
  ADD CONSTRAINT "devoirs_classeId_fkey"
  FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "devoirs"
  ADD CONSTRAINT "devoirs_matiereId_fkey"
  FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON UPDATE CASCADE;

ALTER TABLE "devoirs"
  ADD CONSTRAINT "devoirs_enseignantId_fkey"
  FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7b. Clés étrangères — remplacements_cours
ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_emploiTempsId_fkey"
  FOREIGN KEY ("emploiTempsId") REFERENCES "emplois_temps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_classeId_fkey"
  FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON UPDATE CASCADE;

ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_matiereId_fkey"
  FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON UPDATE CASCADE;

ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_enseignantAbsentId_fkey"
  FOREIGN KEY ("enseignantAbsentId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_enseignantRemplacantId_fkey"
  FOREIGN KEY ("enseignantRemplacantId") REFERENCES "enseignants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "remplacements_cours"
  ADD CONSTRAINT "remplacements_cours_decideParId_fkey"
  FOREIGN KEY ("decideParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7c. Clés étrangères — entretiens_conseiller
ALTER TABLE "entretiens_conseiller"
  ADD CONSTRAINT "entretiens_conseiller_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entretiens_conseiller"
  ADD CONSTRAINT "entretiens_conseiller_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "entretiens_conseiller"
  ADD CONSTRAINT "entretiens_conseiller_eleveId_fkey"
  FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "entretiens_conseiller"
  ADD CONSTRAINT "entretiens_conseiller_conseillerId_fkey"
  FOREIGN KEY ("conseillerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
