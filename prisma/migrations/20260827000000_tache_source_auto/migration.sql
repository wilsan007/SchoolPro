-- Ajout des champs sourceType et sourceId pour les tâches auto-générées.
-- Permet au moteur de génération de tâches d'être idempotent :
-- une tâche par enregistrement source, identifiable par (sourceType, sourceId).

ALTER TABLE "taches" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "taches" ADD COLUMN "sourceId" TEXT;

-- Index composite pour la recherche d'idempotence.
CREATE INDEX "taches_sourceType_sourceId_idx" ON "taches" ("sourceType", "sourceId");
