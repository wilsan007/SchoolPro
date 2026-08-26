-- ============================================================
-- MANUAL-02 : Réparation des mots de passe des comptes de démonstration
-- À exécuter UNE FOIS sur toute base déjà chargée avec les dumps
-- antérieurs au correctif (production VPS, Supabase, environnements de test).
-- ============================================================
--
-- CONTEXTE
-- Les dumps `prisma/sql/*.sql` portaient tous le même hash bcrypt :
--     $2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
-- Ce hash ne correspond à AUCUN mot de passe : c'est un salt d'exemple
-- (`N9qo8uLOickgx2ZMRZoMye`, très répandu dans les documentations) recollé
-- derrière un préfixe de coût `12` alors que son digest a été produit avec un
-- autre coût. Le coût entrant dans la dérivation de clé bcrypt, la
-- vérification échouait systématiquement.
--
-- Conséquence : `bcrypt.compare()` dans src/lib/auth.ts renvoyait toujours
-- `false`, `authorize()` renvoyait `null`, et l'interface affichait
-- « Identifiants invalides » pour la totalité des comptes chargés — alors
-- que les lignes `users` étaient bien présentes et `isActive = TRUE`.
--
-- Ce script remplace ce hash par un hash bcrypt valide (coût 12) du mot de
-- passe `Ambouli@2026!`, celui qui était déjà documenté dans les dumps.
--
-- Vérification du hash de remplacement :
--   node -e "console.log(require('bcryptjs').compareSync('Ambouli@2026!','\$2a\$12\$1b7BChA.QF/6pf3jZkl6B.YUM5iMNKRG67GePvECwZN7VJe5I9FDC'))"
--   → true
--
-- SÛRETÉ : le WHERE ne cible QUE l'ancien hash cassé. Aucun mot de passe
-- réellement choisi par un utilisateur n'est touché, et le script est
-- idempotent (une seconde exécution ne modifie plus rien).
-- ============================================================

BEGIN;

-- 1. État avant
SELECT 'avant' AS etape,
       count(*) FILTER (WHERE "password" = '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy') AS comptes_casses,
       count(*) AS comptes_total
FROM users;

-- 2. Réparation
UPDATE users
SET "password"  = '$2a$12$1b7BChA.QF/6pf3jZkl6B.YUM5iMNKRG67GePvECwZN7VJe5I9FDC',
    "updatedAt" = NOW()
WHERE "password" = '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

-- 3. État après — `comptes_casses` doit valoir 0
SELECT 'apres' AS etape,
       count(*) FILTER (WHERE "password" = '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy') AS comptes_casses,
       count(*) FILTER (WHERE "password" = '$2a$12$1b7BChA.QF/6pf3jZkl6B.YUM5iMNKRG67GePvECwZN7VJe5I9FDC') AS comptes_repares,
       count(*) AS comptes_total
FROM users;

COMMIT;

-- ------------------------------------------------------------
-- Variante : forcer le changement du mot de passe à la première
-- connexion. Non appliquée par défaut — `(dashboard)/layout.tsx`
-- redirige alors vers /profil tant que le mot de passe n'a pas été
-- changé, ce qui rend le jeu de démonstration pénible à parcourir.
-- ------------------------------------------------------------
-- UPDATE users SET "mustChangePassword" = TRUE
-- WHERE "password" = '$2a$12$1b7BChA.QF/6pf3jZkl6B.YUM5iMNKRG67GePvECwZN7VJe5I9FDC';
