-- ============================================================
-- Migration : bulletin_verrouillage_historique
-- Verrouillage des bulletins par trimestre + historisation des modifications.
--
--   - bulletins.statut : BROUILLON | VERROUILLE | PUBLIE
--   - bulletins.verrouille_at : date de verrouillage
--   - bulletins.verrouille_par : ID utilisateur qui a verrouillé
--   - bulletin_historique : journal d'audit de toutes les modifications
--
-- Règle : lorsqu'un bulletin est VERROUILLE ou PUBLIE, seul le
-- TENANT_ADMIN (administrateur) peut le modifier. Toute modification,
-- même par le directeur, est enregistrée dans bulletin_historique.
-- ============================================================

-- 1. Nouvelles colonnes sur la table bulletins
ALTER TABLE "bulletins" ADD COLUMN IF NOT EXISTS "statut" TEXT NOT NULL DEFAULT 'BROUILLON';
ALTER TABLE "bulletins" ADD COLUMN IF NOT EXISTS "verrouilleAt" TIMESTAMP(3);
ALTER TABLE "bulletins" ADD COLUMN IF NOT EXISTS "verrouilleParId" TEXT;

-- 2. Index sur le statut pour filtrer rapidement les bulletins verrouillés
CREATE INDEX IF NOT EXISTS "bulletins_tenantId_statut_idx" ON "bulletins"("tenantId", "statut");

-- 3. Table d'historique des modifications de bulletin
CREATE TABLE IF NOT EXISTS "bulletin_historique" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "bulletinId"      TEXT NOT NULL,
  "auteurId"        TEXT,
  "auteurNom"       TEXT,
  "auteurRole"      TEXT,
  "champ"           TEXT NOT NULL,
  "ancienneValeur"  TEXT,
  "nouvelleValeur"  TEXT,
  "action"          TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bulletin_historique_pkey" PRIMARY KEY ("id")
);

-- 4. Clés étrangères
ALTER TABLE "bulletin_historique"
  ADD CONSTRAINT "bulletin_historique_bulletinId_fkey"
  FOREIGN KEY ("bulletinId") REFERENCES "bulletins"("id") ON DELETE CASCADE;

-- 5. Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS "bulletin_historique_tenantId_idx" ON "bulletin_historique"("tenantId");
CREATE INDEX IF NOT EXISTS "bulletin_historique_bulletinId_idx" ON "bulletin_historique"("bulletinId");
CREATE INDEX IF NOT EXISTS "bulletin_historique_auteurId_idx" ON "bulletin_historique"("auteurId");
CREATE INDEX IF NOT EXISTS "bulletin_historique_createdAt_idx" ON "bulletin_historique"("createdAt");

-- 6. Migrer les bulletins déjà publiés vers le statut PUBLIE
UPDATE "bulletins" SET "statut" = 'PUBLIE' WHERE "isPublie" = true AND "statut" = 'BROUILLON';
