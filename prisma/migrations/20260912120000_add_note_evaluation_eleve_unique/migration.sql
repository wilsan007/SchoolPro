-- IA-H1 (audit v2) : contrainte unique (evaluationId, eleveId) sur notes
-- pour permettre l'upsert et préserver les identifiants de notes lors
-- d'une correction, afin de stabiliser les preuves LEARNOS.

-- Avant d'ajouter la contrainte, supprimer les doublons éventuels :
-- garder la note la plus récente (updatedAt) pour chaque (evaluationId, eleveId).
DELETE FROM notes n1
USING notes n2
WHERE n1."evaluationId" IS NOT NULL
  AND n1."evaluationId" = n2."evaluationId"
  AND n1."eleveId" = n2."eleveId"
  AND n1.id < n2.id;

-- Ajouter la contrainte unique de façon idempotente.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notes_evaluationId_eleveId_key'
  ) THEN
    ALTER TABLE notes ADD CONSTRAINT notes_evaluationId_eleveId_key
      UNIQUE ("evaluationId", "eleveId");
  END IF;
END $$;
