-- ============================================================
-- Migration : table user_roles (multi-rôle par tenant)
-- ============================================================
-- Permet à un utilisateur de posséder plusieurs rôles dans le
-- même tenant. UserTenant.role reste le rôle ACTIF (pointeur),
-- UserRole stocke l'inventaire complet des rôles possédés.
-- ============================================================

CREATE TABLE IF NOT EXISTS "user_roles" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "role"      "Role" NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- Unicité : un rôle par user par tenant, mais plusieurs lignes possibles
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_userId_tenantId_role_key"
    ON "user_roles"("userId", "tenantId", "role");

-- Index sur tenantId pour les requêtes par établissement
CREATE INDEX IF NOT EXISTS "user_roles_tenantId_idx"
    ON "user_roles"("tenantId");

-- Clés étrangères
ALTER TABLE "user_roles"
    ADD CONSTRAINT "user_roles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE;

ALTER TABLE "user_roles"
    ADD CONSTRAINT "user_roles_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE;

-- ============================================================
-- Seed : peupler user_roles depuis user_tenants existants
-- Chaque adhésion existante devient un rôle possédé.
-- ============================================================
INSERT INTO "user_roles" ("id", "userId", "tenantId", "role", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    ut."userId",
    ut."tenantId",
    ut."role",
    ut."isActive",
    NOW(),
    NOW()
FROM "user_tenants" ut
WHERE NOT EXISTS (
    SELECT 1 FROM "user_roles" ur
    WHERE ur."userId" = ut."userId"
      AND ur."tenantId" = ut."tenantId"
      AND ur."role" = ut."role"
);
