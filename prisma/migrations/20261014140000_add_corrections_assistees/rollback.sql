-- Retour arrière de 20261014140000_add_corrections_assistees.
-- À n'exécuter qu'APRÈS avoir déployé un code qui n'écrit ni ne lit plus la
-- table (règle 5 : jamais de suppression avant confirmation).
--
-- Cette table n'alimente aucun profil : la supprimer ne modifie aucune preuve
-- d'apprentissage déjà produite. Seules les propositions en attente sont perdues.

DROP TABLE IF EXISTS "learnos_corrections_assistees";
DROP TYPE IF EXISTS "StatutCorrectionAssistee";
