-- ============================================================
-- MIGRATION — Relation User ↔ Eleve (compte de connexion élève)
-- Contexte: MENFOP Phase 1.3 — génération des comptes élèves en masse
-- Ajoute Eleve.userId (FK optionnelle, unique) vers users.id
-- ============================================================
-- Idempotent : peut être ré-exécuté sans erreur.

-- 1. Colonne userId sur eleves (optionnelle : tous les élèves n'ont pas de compte)
ALTER TABLE public.eleves ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- 2. Unicité : 1 compte User = 1 Eleve maximum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eleves_userId_key'
  ) THEN
    ALTER TABLE public.eleves
      ADD CONSTRAINT "eleves_userId_key" UNIQUE ("userId");
  END IF;
END $$;

-- 3. Clé étrangère vers users. ON DELETE SET NULL :
--    supprimer un compte ne supprime PAS l'élève (on conserve l'historique scolaire).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eleves_userId_fkey'
  ) THEN
    ALTER TABLE public.eleves
      ADD CONSTRAINT "eleves_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public.users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Vérification
-- SELECT e.matricule, e.nom, e.prenom, u.email AS compte
-- FROM eleves e LEFT JOIN users u ON u.id = e."userId"
-- ORDER BY e.nom;
