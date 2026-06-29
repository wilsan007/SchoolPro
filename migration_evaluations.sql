-- Migration SQL pour l'ajout des Évaluations (Contrôles, Devoirs)
-- Rendue idempotente (résiste aux exécutions multiples sans erreur)

-- 1. Création de la table "evaluations" si elle n'existe pas
CREATE TABLE IF NOT EXISTS "evaluations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "TypeNote" NOT NULL DEFAULT 'CONTROLE',
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duree" INTEGER NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "description" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'PLANIFIE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- 2. Ajout des relations pour "evaluations" (nettoyage puis recréation pour éviter les doublons)
ALTER TABLE "evaluations" DROP CONSTRAINT IF EXISTS "evaluations_tenantId_fkey";
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evaluations" DROP CONSTRAINT IF EXISTS "evaluations_classeId_fkey";
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evaluations" DROP CONSTRAINT IF EXISTS "evaluations_matiereId_fkey";
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "evaluations" DROP CONSTRAINT IF EXISTS "evaluations_periodeId_fkey";
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "periodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Ajout des colonnes à la table "notes" si elles n'existent pas
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "commentaire" TEXT;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "evaluationId" TEXT;

-- 4. Ajout de la relation pour "notes" vers "evaluations" (nettoyage puis recréation)
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_evaluationId_fkey";
ALTER TABLE "notes" ADD CONSTRAINT "notes_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
