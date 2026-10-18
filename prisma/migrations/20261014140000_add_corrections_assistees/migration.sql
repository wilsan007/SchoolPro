-- ============================================================
-- Corrections assistées : table d'attente des corrections proposées par un modèle
-- ============================================================
-- ADDITIVE (règle 5) : crée un enum, une table, ses index et ses clés
-- étrangères. Ne supprime et ne modifie RIEN d'existant.
--
-- IDEMPOTENTE : rejouable sans effet (existence vérifiée avant chaque création).
--
-- POURQUOI UNE TABLE D'ATTENTE ET NON UNE PREUVE
-- Une `learnos_evidences` alimente le jumeau d'apprentissage dès son écriture.
-- Une correction proposée par un modèle n'a pas à y entrer tant qu'un adulte ne
-- l'a pas relue : la preuve est créée à la validation, et c'est alors une
-- preuve supervisée. Cette table ne pèse donc sur AUCUN profil d'élève.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatutCorrectionAssistee') THEN
    CREATE TYPE "StatutCorrectionAssistee" AS ENUM ('A_VALIDER', 'INCERTAINE', 'VALIDEE', 'REJETEE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "learnos_corrections_assistees" (
  "id"                   TEXT NOT NULL,
  "tenantId"             TEXT NOT NULL,
  "siteId"               TEXT,
  "eleveId"              TEXT NOT NULL,
  "questionId"           TEXT NOT NULL,
  "grilleVersion"        INTEGER NOT NULL,
  "reponse"              TEXT NOT NULL,
  "statut"               "StatutCorrectionAssistee" NOT NULL,
  "score"                DOUBLE PRECISION NOT NULL,
  "maxScore"             DOUBLE PRECISION NOT NULL,
  "criteresReussis"      JSONB NOT NULL,
  "details"              JSONB NOT NULL,
  "erreurs"              JSONB NOT NULL,
  "explication"          TEXT,
  "questionVerification" TEXT,
  "confiance"            DOUBLE PRECISION NOT NULL,
  "motifs"               JSONB NOT NULL,
  "modele"               TEXT NOT NULL,
  "promptVersion"        TEXT NOT NULL,
  "valideParId"          TEXT,
  "valideeLe"            TIMESTAMP(3),
  "criteresValides"      JSONB,
  "scoreValide"          DOUBLE PRECISION,
  "evidenceId"           TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learnos_corrections_assistees_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learnos_corrections_assistees_tenantId_fkey') THEN
    ALTER TABLE "learnos_corrections_assistees"
      ADD CONSTRAINT "learnos_corrections_assistees_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learnos_corrections_assistees_siteId_fkey') THEN
    ALTER TABLE "learnos_corrections_assistees"
      ADD CONSTRAINT "learnos_corrections_assistees_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learnos_corrections_assistees_eleveId_fkey') THEN
    ALTER TABLE "learnos_corrections_assistees"
      ADD CONSTRAINT "learnos_corrections_assistees_eleveId_fkey"
      FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'learnos_corrections_assistees_questionId_fkey') THEN
    ALTER TABLE "learnos_corrections_assistees"
      ADD CONSTRAINT "learnos_corrections_assistees_questionId_fkey"
      FOREIGN KEY ("questionId") REFERENCES "learnos_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "learnos_corrections_assistees_tenantId_statut_idx"
  ON "learnos_corrections_assistees" ("tenantId", "statut");
CREATE INDEX IF NOT EXISTS "learnos_corrections_assistees_siteId_idx"
  ON "learnos_corrections_assistees" ("siteId");
CREATE INDEX IF NOT EXISTS "learnos_corrections_assistees_eleveId_idx"
  ON "learnos_corrections_assistees" ("eleveId");
CREATE INDEX IF NOT EXISTS "learnos_corrections_assistees_questionId_idx"
  ON "learnos_corrections_assistees" ("questionId");

-- RLS : la table est tenant + site. Les politiques sont dérivées du schéma par
-- `pnpm rls:generate` (prisma/sql/rls/02-policies.sql).
ALTER TABLE "learnos_corrections_assistees" ENABLE ROW LEVEL SECURITY;
