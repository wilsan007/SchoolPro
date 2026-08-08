-- Migration: Note.evaluation onDelete: Cascade → Restrict
-- Empêche la suppression d'une évaluation notée (perte de données silencieuse)
-- ============================================================

-- 1. Vérification préalable : identifier les évaluations notées
-- SELECT e.id, COUNT(n.id) AS nb_notes
-- FROM evaluations e
-- LEFT JOIN notes n ON n."evaluationId" = e.id
-- GROUP BY e.id HAVING COUNT(n.id) > 0;

-- 2. Remplacer la contrainte de clé étrangère
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_evaluationId_fkey;
ALTER TABLE notes ADD CONSTRAINT notes_evaluationId_fkey
  FOREIGN KEY ("evaluationId") REFERENCES evaluations(id) ON DELETE RESTRICT;
