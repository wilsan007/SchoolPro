-- Migration additive : ajout de l'enum TypeFacture et de la colonne type sur factures.
-- Procédure additive (règle 5 AGENTS.md) : on ajoute sans supprimer.
-- Le DEFAULT 'MENSUALITE' garantit que les factures existantes ont un type valide.

-- 1. Créer l'enum TypeFacture
DO $$ BEGIN
  CREATE TYPE "TypeFacture" AS ENUM ('MENSUALITE', 'INSCRIPTION', 'RENOUVELLEMENT', 'CANTINE', 'TRANSPORT', 'LIBRE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ajouter la colonne type avec DEFAULT 'MENSUALITE' (idempotent)
ALTER TABLE "factures" ADD COLUMN IF NOT EXISTS "type" "TypeFacture" NOT NULL DEFAULT 'MENSUALITE';

-- 3. Backfill : deviner le type des factures existantes à partir du libellé.
--    On ne modifie que les lignes qui ont encore le DEFAULT 'MENSUALITE' mais
--    dont le libellé indique clairement un autre type.
UPDATE "factures" SET "type" = 'INSCRIPTION'
  WHERE "type" = 'MENSUALITE'
    AND lower("libelle") LIKE '%inscription%';

UPDATE "factures" SET "type" = 'RENOUVELLEMENT'
  WHERE "type" = 'MENSUALITE'
    AND lower("libelle") LIKE '%renouvellement%';

UPDATE "factures" SET "type" = 'CANTINE'
  WHERE "type" = 'MENSUALITE'
    AND lower("libelle") LIKE '%cantine%';

UPDATE "factures" SET "type" = 'TRANSPORT'
  WHERE "type" = 'MENSUALITE'
    AND lower("libelle") LIKE '%transport%';

-- 4. Index pour accélérer les vérifications d'unicité (eleveId, type, mois)
CREATE INDEX IF NOT EXISTS "factures_eleveId_type_mois_idx"
  ON "factures" ("eleveId", "type", "mois");
