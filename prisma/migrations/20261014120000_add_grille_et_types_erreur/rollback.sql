-- Retour arrière de 20261014120000_add_grille_et_types_erreur.
-- À n'exécuter qu'APRÈS avoir déployé un code qui ne lit plus ces colonnes
-- (règle 5 : jamais de suppression avant confirmation).
--
-- Les trois valeurs d'enum `ErrorType` ne sont volontairement PAS retirées :
-- PostgreSQL ne sait pas supprimer une valeur d'enum sans recréer le type, et
-- elles sont inertes tant que rien ne les écrit.

ALTER TABLE "learnos_questions" DROP COLUMN IF EXISTS "grille";
ALTER TABLE "learnos_questions" DROP COLUMN IF EXISTS "grilleVersion";
