-- Migration: Gestion du personnel — Absences et Congés
-- Création des tables absences_personnel et conges_personnel

-- Types énumérés
DO $$ BEGIN
  CREATE TYPE "TypeAbsencePersonnel" AS ENUM ('ABSENCE', 'RETARD', 'MISSION', 'FORMATION', 'MALADIE', 'AUTRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatutAbsencePersonnel" AS ENUM ('EN_ATTENTE', 'JUSTIFIEE', 'INJUSTIFIEE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatutConge" AS ENUM ('DEMANDE', 'APPROUVE', 'REFUSE', 'EN_COURS', 'TERMINE', 'ANNULE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TypeConge" AS ENUM ('ANNUEL', 'MALADIE', 'SPECIAL', 'MATERNITE', 'PATERNITE', 'SANS_SOLDE', 'AUTRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table: absences_personnel
CREATE TABLE IF NOT EXISTS "absences_personnel" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "enseignantId" TEXT NOT NULL REFERENCES "enseignants"("id") ON DELETE CASCADE,
  "date" TIMESTAMP(3) NOT NULL,
  "heureDebut" TEXT,
  "heureFin" TEXT,
  "type" "TypeAbsencePersonnel" NOT NULL DEFAULT 'ABSENCE',
  "statut" "StatutAbsencePersonnel" NOT NULL DEFAULT 'EN_ATTENTE',
  "motif" TEXT,
  "justificatif" TEXT,
  "commentaire" TEXT,
  "saisieParId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_absences_personnel_tenant ON "absences_personnel"("tenantId");
CREATE INDEX IF NOT EXISTS idx_absences_personnel_enseignant ON "absences_personnel"("enseignantId");
CREATE INDEX IF NOT EXISTS idx_absences_personnel_tenant_date ON "absences_personnel"("tenantId", "date");

-- Table: conges_personnel
CREATE TABLE IF NOT EXISTS "conges_personnel" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "enseignantId" TEXT NOT NULL REFERENCES "enseignants"("id") ON DELETE CASCADE,
  "type" "TypeConge" NOT NULL DEFAULT 'ANNUEL',
  "statut" "StatutConge" NOT NULL DEFAULT 'DEMANDE',
  "dateDebut" TIMESTAMP(3) NOT NULL,
  "dateFin" TIMESTAMP(3) NOT NULL,
  "nbJours" DECIMAL(10,1) NOT NULL DEFAULT 0,
  "motif" TEXT,
  "justificatif" TEXT,
  "demandeParId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "approuveParId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "approuveAt" TIMESTAMP(3),
  "commentaire" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conges_personnel_tenant ON "conges_personnel"("tenantId");
CREATE INDEX IF NOT EXISTS idx_conges_personnel_enseignant ON "conges_personnel"("enseignantId");
CREATE INDEX IF NOT EXISTS idx_conges_personnel_tenant_statut ON "conges_personnel"("tenantId", "statut");
