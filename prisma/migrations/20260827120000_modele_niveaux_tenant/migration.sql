-- Migration : Ajout du modèle de nommage des niveaux sur le Tenant
-- Permet de choisir entre le système "années" (1ère année → 9ème année)
-- et le système français (CI, CP, CE1, CE2, CM1, CM2, 6ème → 3ème).

-- 1. Créer le type enum ModeleNiveaux
DO $$ BEGIN
    CREATE TYPE "ModeleNiveaux" AS ENUM ('ANNEES', 'FRANCAIS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ajouter la colonne modeleNiveaux sur la table tenants
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "modeleNiveaux" "ModeleNiveaux" NOT NULL DEFAULT 'ANNEES';
