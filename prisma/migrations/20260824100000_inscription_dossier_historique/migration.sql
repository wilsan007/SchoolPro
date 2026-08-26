-- ============================================================
-- Migration : inscription_dossier_historique
-- Module d'inscription du secrétariat : pièces structurées,
-- statut de dossier, traçabilité (création/validation/clôture)
-- et historique d'audit des dossiers d'inscription.
--
--   - candidatures.documentsInscription : pièces structurées (photo,
--     acte de naissance, pièce parent, bulletin scolaire)
--   - candidatures.dossierStatut : INCOMPLET | EN_COURS | COMPLETE | VALIDE | CLOS
--   - candidatures.creeParId / valideParId / valideLe / closLe
--   - inscription_historique : journal d'audit (création, ajouts,
--     changements de statut, validation, clôture…)
-- ============================================================

-- 1. Nouvelles colonnes sur la table candidatures
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "documentsInscription" JSONB;
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "dossierStatut" TEXT NOT NULL DEFAULT 'INCOMPLET';
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "creeParId" TEXT;
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "valideParId" TEXT;
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "valideLe" TIMESTAMP(3);
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "closLe" TIMESTAMP(3);

-- 2. Index sur le statut du dossier pour filtrer rapidement (indicateurs direction)
CREATE INDEX IF NOT EXISTS "candidatures_tenantId_dossierStatut_idx"
  ON "candidatures"("tenantId", "dossierStatut");

-- 3. Clés étrangères vers users (créateur / validateur du dossier)
ALTER TABLE "candidatures"
  ADD CONSTRAINT "candidatures_creeParId_fkey"
  FOREIGN KEY ("creeParId") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "candidatures"
  ADD CONSTRAINT "candidatures_valideParId_fkey"
  FOREIGN KEY ("valideParId") REFERENCES "users"("id") ON DELETE SET NULL;

-- 4. Table d'historique d'audit des dossiers d'inscription
CREATE TABLE IF NOT EXISTS "inscription_historique" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "candidatureId"   TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "auteurId"        TEXT,
  "auteurNom"       TEXT,
  "donnees"         JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inscription_historique_pkey" PRIMARY KEY ("id")
);

-- 5. Clés étrangères de l'historique
ALTER TABLE "inscription_historique"
  ADD CONSTRAINT "inscription_historique_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "inscription_historique"
  ADD CONSTRAINT "inscription_historique_candidatureId_fkey"
  FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE CASCADE;

ALTER TABLE "inscription_historique"
  ADD CONSTRAINT "inscription_historique_auteurId_fkey"
  FOREIGN KEY ("auteurId") REFERENCES "users"("id") ON DELETE SET NULL;

-- 6. Index de l'historique
CREATE INDEX IF NOT EXISTS "inscription_historique_tenantId_idx"
  ON "inscription_historique"("tenantId");
CREATE INDEX IF NOT EXISTS "inscription_historique_candidatureId_idx"
  ON "inscription_historique"("candidatureId");
