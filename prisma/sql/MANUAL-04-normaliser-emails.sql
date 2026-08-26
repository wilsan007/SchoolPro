-- ============================================================
-- MANUAL-04 : Normalisation des adresses e-mail en minuscules
-- À exécuter sur toute base où des comptes ont été créés avec une majuscule.
-- ============================================================
--
-- CAUSE
-- PostgreSQL compare les chaînes octet par octet, et le code
-- d'authentification faisait `findUnique({ where: { email } })` sur la valeur
-- saisie telle quelle. Un compte enregistré `Mohamed.abdi.pk12@gmail.com`
-- était donc introuvable pour quiconque tapait son adresse en minuscules —
-- ce que fait spontanément un clavier mobile. L'interface répondait
-- « Identifiants invalides » alors que le compte existait et était actif.
--
-- La preuve était dans `audit_logs` :
--   DENIED | Utilisateur introuvable | {"email": "mohamed.abdi.pk12@gmail.com"}
--   DENIED | Utilisateur introuvable | {"email": "ilyasadendjama@gmail.com"}
-- pour deux comptes bien présents en base, à la casse près.
--
-- CORRECTIF LOGICIEL ASSOCIÉ
-- `src/lib/email.ts` (normaliserEmail) + recherche insensible à la casse
-- dans `src/lib/auth.ts` et `src/app/api/auth/mobile/route.ts`. Ce script
-- traite les données déjà en base : il rétablit la connexion SANS attendre
-- un redéploiement, l'image en production étant antérieure au correctif.
--
-- SÛRETÉ : `email` porte une contrainte UNIQUE. Le script refuse de
-- s'exécuter si deux comptes ne diffèrent que par la casse — il faudrait
-- alors arbitrer lequel conserver. Idempotent.
-- ============================================================

BEGIN;

-- 1. Garde-fou : collisions après passage en minuscules
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1
  ) collisions;
  IF n > 0 THEN
    RAISE EXCEPTION
      'ARRÊT : % adresse(s) deviendraient identiques en minuscules. Arbitrer les doublons avant de rejouer ce script.', n;
  END IF;
END $$;

-- 2. État avant
SELECT 'avant' AS etape,
       count(*) AS total,
       count(*) FILTER (WHERE email <> lower(email)) AS a_normaliser
FROM users;

SELECT email AS adresses_concernees FROM users WHERE email <> lower(email) ORDER BY email;

-- 3. Normalisation
UPDATE users
SET email = lower(email),
    "updatedAt" = NOW()
WHERE email <> lower(email);

-- 4. État après — `a_normaliser` doit valoir 0
SELECT 'apres' AS etape,
       count(*) AS total,
       count(*) FILTER (WHERE email <> lower(email)) AS a_normaliser
FROM users;

COMMIT;
