-- Migration additive : ajout de la colonne `langue` à la banque de questions.
--
-- Permet de stocker des exercices en plusieurs langues (fr, so, en) et de
-- filtrer le tirage par langue de l'élève. La valeur par défaut "fr" garantit
-- que les questions existantes restent servables sans modification.

-- 1. Ajouter la colonne avec valeur par défaut.
ALTER TABLE "learnos_questions" ADD COLUMN IF NOT EXISTS "langue" TEXT NOT NULL DEFAULT 'fr';

-- 2. Index pour le tirage filtré par langue (remplace l'index existant).
DROP INDEX IF EXISTS "learnos_questions_competenceId_palier_actif_idx";
CREATE INDEX "learnos_questions_competenceId_palier_actif_langue_idx"
  ON "learnos_questions" ("competenceId", "palier", "actif", "langue");
