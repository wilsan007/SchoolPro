-- ============================================================
-- Grille de correction versionnée + trois types d'erreur
-- ============================================================
-- ADDITIVE (règle 5) : ajoute deux colonnes à `learnos_questions` et trois
-- valeurs à l'enum `ErrorType`. Ne supprime et ne modifie RIEN d'existant.
--
-- IDEMPOTENTE : rejouable sans effet.
--   - `ADD VALUE IF NOT EXISTS` pour l'enum ;
--   - `ADD COLUMN IF NOT EXISTS` pour les colonnes.
--
-- NOTE SUR L'ENUM : PostgreSQL ne permet pas de retirer une valeur d'enum sans
-- recréer le type. Le retour arrière (rollback.sql) laisse donc les trois
-- valeurs en place : elles sont inertes tant que le code ne les écrit pas, et
-- les retirer exigerait de réécrire toute colonne qui les utiliserait.
--
-- `grilleVersion` démarre à 1 : toute question existante est, rétroactivement,
-- « sous la version 1 sans grille ».
-- ============================================================

ALTER TYPE "ErrorType" ADD VALUE IF NOT EXISTS 'NOTATION_ERROR';
ALTER TYPE "ErrorType" ADD VALUE IF NOT EXISTS 'ARGUMENT_UNJUSTIFIED';
ALTER TYPE "ErrorType" ADD VALUE IF NOT EXISTS 'WRITING_ERROR';

ALTER TABLE "learnos_questions" ADD COLUMN IF NOT EXISTS "grille" JSONB;
ALTER TABLE "learnos_questions" ADD COLUMN IF NOT EXISTS "grilleVersion" INTEGER NOT NULL DEFAULT 1;
