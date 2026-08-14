-- Migration SQL — LEARNOS : exercices adaptés à l'élève
-- Tables de la couche « sélecteur » : banque de questions, feuilles composées,
-- exercices servis et réponses.
--
-- Rendue idempotente (résiste aux exécutions multiples sans erreur).
--
-- Dépend des tables LEARNOS existantes : learnos_competences,
-- learnos_etapes_plan, ainsi que tenants / sites / eleves / matieres.

-- ------------------------------------------------------------
-- 1. Types énumérés
-- ------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE "PalierExercice" AS ENUM ('RESTITUTION', 'APPLICATION', 'CONSOLIDATION', 'TRANSFERT', 'OUVERTURE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "StatutFeuille" AS ENUM ('PROPOSEE', 'ASSIGNEE', 'EN_COURS', 'TERMINEE', 'REFUSEE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "learnos_questions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "competenceId" TEXT NOT NULL,
    "palier" "PalierExercice" NOT NULL,
    "enonce" TEXT NOT NULL,
    "corrige" TEXT,
    "bareme" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "origine" TEXT NOT NULL DEFAULT 'humain',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "learnos_feuilles_exercices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "eleveId" TEXT NOT NULL,
    "matiereId" TEXT,
    "type" TEXT NOT NULL,
    "statut" "StatutFeuille" NOT NULL DEFAULT 'ASSIGNEE',
    "etapePlanId" TEXT,
    "valideParId" TEXT,
    "valideeLe" TIMESTAMP(3),
    "assigneeLe" TIMESTAMP(3),
    "termineeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_feuilles_exercices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "learnos_exercices_assignes" (
    "id" TEXT NOT NULL,
    "feuilleId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "competenceId" TEXT NOT NULL,
    "competenceViseeId" TEXT,
    "ordre" INTEGER NOT NULL,
    "palier" "PalierExercice" NOT NULL,
    "regleDeclenchee" TEXT NOT NULL,
    "motifParams" JSONB,
    "priorite" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learnos_exercices_assignes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "learnos_exercices_reponses" (
    "id" TEXT NOT NULL,
    "exerciceAssigneId" TEXT NOT NULL,
    "reponse" TEXT,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "corrigeParId" TEXT,
    "corrigeeLe" TIMESTAMP(3),
    "evidenceId" TEXT,
    "repondueLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learnos_exercices_reponses_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------
-- 3. Index
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "learnos_questions_tenantId_idx" ON "learnos_questions"("tenantId");
CREATE INDEX IF NOT EXISTS "learnos_questions_siteId_idx" ON "learnos_questions"("siteId");
-- Sert le tirage du sélecteur : questions actives d'une compétence à un palier.
CREATE INDEX IF NOT EXISTS "learnos_questions_competenceId_palier_actif_idx" ON "learnos_questions"("competenceId", "palier", "actif");

CREATE INDEX IF NOT EXISTS "learnos_feuilles_exercices_tenantId_idx" ON "learnos_feuilles_exercices"("tenantId");
CREATE INDEX IF NOT EXISTS "learnos_feuilles_exercices_siteId_idx" ON "learnos_feuilles_exercices"("siteId");
CREATE INDEX IF NOT EXISTS "learnos_feuilles_exercices_eleveId_statut_idx" ON "learnos_feuilles_exercices"("eleveId", "statut");

CREATE INDEX IF NOT EXISTS "learnos_exercices_assignes_feuilleId_idx" ON "learnos_exercices_assignes"("feuilleId");
CREATE INDEX IF NOT EXISTS "learnos_exercices_assignes_competenceId_idx" ON "learnos_exercices_assignes"("competenceId");

CREATE UNIQUE INDEX IF NOT EXISTS "learnos_exercices_reponses_exerciceAssigneId_key" ON "learnos_exercices_reponses"("exerciceAssigneId");
CREATE INDEX IF NOT EXISTS "learnos_exercices_reponses_evidenceId_idx" ON "learnos_exercices_reponses"("evidenceId");

-- ------------------------------------------------------------
-- 4. Clés étrangères
-- ------------------------------------------------------------

DO $$ BEGIN
    ALTER TABLE "learnos_questions" ADD CONSTRAINT "learnos_questions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_questions" ADD CONSTRAINT "learnos_questions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_questions" ADD CONSTRAINT "learnos_questions_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_feuilles_exercices" ADD CONSTRAINT "learnos_feuilles_exercices_etapePlanId_fkey" FOREIGN KEY ("etapePlanId") REFERENCES "learnos_etapes_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_exercices_assignes" ADD CONSTRAINT "learnos_exercices_assignes_feuilleId_fkey" FOREIGN KEY ("feuilleId") REFERENCES "learnos_feuilles_exercices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT et non CASCADE : supprimer une question de la banque ne doit pas
-- effacer les exercices déjà servis, sous peine de trouer l'historique d'un
-- élève. Retirer une question se fait par `actif = false`.
DO $$ BEGIN
    ALTER TABLE "learnos_exercices_assignes" ADD CONSTRAINT "learnos_exercices_assignes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "learnos_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_exercices_assignes" ADD CONSTRAINT "learnos_exercices_assignes_competenceId_fkey" FOREIGN KEY ("competenceId") REFERENCES "learnos_competences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "learnos_exercices_reponses" ADD CONSTRAINT "learnos_exercices_reponses_exerciceAssigneId_fkey" FOREIGN KEY ("exerciceAssigneId") REFERENCES "learnos_exercices_assignes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
