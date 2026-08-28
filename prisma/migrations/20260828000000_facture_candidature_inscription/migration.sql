-- Rendre eleveId nullable (factures d'admission créées avant l'élève)
ALTER TABLE "factures" ALTER COLUMN "eleveId" DROP NOT NULL;

-- Ajouter candidatureId (lien vers la candidature d'admission)
ALTER TABLE "factures" ADD COLUMN "candidatureId" TEXT;

-- Ajouter mois (mois de scolarité facturé, format "YYYY-MM")
ALTER TABLE "factures" ADD COLUMN "mois" TEXT;

-- Index sur candidatureId
CREATE INDEX "factures_candidatureId_idx" ON "factures"("candidatureId");

-- Ajouter la valeur DOSSIER_COMPLET à l'enum StatutCandidature
ALTER TYPE "StatutCandidature" ADD VALUE 'DOSSIER_COMPLET' AFTER 'SOUMISE';

-- FK factures → candidatures
ALTER TABLE "factures" ADD CONSTRAINT "factures_candidatureId_fkey"
  FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
