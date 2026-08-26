-- ============================================================
-- MANUAL-03 : Alignement du schéma de production avant redéploiement
-- Base : ecolemiriam (production)
--
-- ⚠️  CE SCRIPT N'EST PAS LE CORRECTIF DE LA PANNE DE CONNEXION.
-- Celle-ci venait de la casse des adresses e-mail : voir
-- MANUAL-04-normaliser-emails.sql. L'image en production (construite le
-- 2026-08-20) est antérieure au code du dépôt et ne lit ni
-- `mustChangePassword` ni `user_roles` ; elle fonctionne donc sur le schéma
-- actuel.
--
-- OBJET
-- Le code du dépôt, lui, a besoin de ces objets. Sans eux, le PROCHAIN
-- déploiement casserait la connexion pour de bon :
--   1. authorize() sélectionne `users.mustChangePassword`  (src/lib/auth.ts)
--   2. deriveClaims() lit la table `user_roles`   (src/lib/tenant-claims.ts)
-- Ces deux objets sont absents de la base de production, qui n'a jamais
-- reçu les changements de schéma : `prisma/migrations/` ne contient que 3
-- migrations pour 114 modèles, le projet ayant été développé en
-- `prisma db push`, et `_prisma_migrations` n'existe même pas en production.
--
-- À APPLIQUER DONC AVANT le prochain `make deploy`, pas après.
--
-- Contenu repris tel quel de `prisma migrate diff`, restreint à ces objets.
-- STRICTEMENT ADDITIF : aucun DROP, aucune donnée touchée. Les 20
-- instructions destructrices du correctif complet (DROP TABLE
-- enseignant_affectations / enseignant_matieres, colonnes de budgets,
-- depenses, paiements, remises_caisse) sont volontairement écartées : elles
-- portent sur des lignes existantes. Le diff complet est archivé dans
-- prisma/sql/_audit/patch-schema-complet-production.sql.
-- ============================================================

BEGIN;

-- ── 1. Colonnes manquantes sur users ────────────────────────
-- authorize() sélectionne `mustChangePassword` ; son absence provoquait une
-- erreur Prisma P2022 à CHAQUE tentative de connexion, avant même la
-- vérification du mot de passe.
ALTER TABLE "users" ADD COLUMN     "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpSecretIv" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorVerifiedAt" TIMESTAMP(3);

-- ── 2. Table user_roles ─────────────────────────────────────
-- deriveClaims() lit `user.userRoles` ; la table n'ayant jamais été créée en
-- production, la dérivation du périmètre échouait juste après la
-- vérification du mot de passe.
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_roles_tenantId_idx" ON "user_roles"("tenantId");

CREATE UNIQUE INDEX "user_roles_userId_tenantId_role_key" ON "user_roles"("userId", "tenantId", "role");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;

-- ── Vérification ────────────────────────────────────────────
SELECT count(*) FILTER (WHERE column_name = 'mustChangePassword') AS col_mustchangepassword,
       count(*) FILTER (WHERE column_name = 'twoFactorEnabled')   AS col_twofactor
FROM information_schema.columns
WHERE table_schema = current_schema() AND table_name = 'users';

SELECT to_regclass('user_roles') AS table_user_roles;
