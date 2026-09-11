-- Migration additive : ImpersonationGrant (AUTH-1, audit v2)
-- Autorisation stockée en base pour l'usurpation SUPER_ADMIN.
-- Le callback jwt ne more accepte les champs d'usurpation depuis
-- POST /api/auth/session ; il verifie le grant en base a chaque passage.

-- Verifier l'existence avant de creer (idempotent)
CREATE TABLE IF NOT EXISTS "impersonation_grants" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetTenantId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "impersonation_grants_pkey" PRIMARY KEY ("id")
);

-- Index sur adminId pour la recherche des grants d'un admin
CREATE INDEX IF NOT EXISTS "impersonation_grants_adminId_idx" ON "impersonation_grants"("adminId");

-- Cles etrangeres
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'impersonation_grants_adminId_fkey'
      AND table_name = 'impersonation_grants'
  ) THEN
    ALTER TABLE "impersonation_grants"
      ADD CONSTRAINT "impersonation_grants_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'impersonation_grants_targetTenantId_fkey'
      AND table_name = 'impersonation_grants'
  ) THEN
    ALTER TABLE "impersonation_grants"
      ADD CONSTRAINT "impersonation_grants_targetTenantId_fkey"
      FOREIGN KEY ("targetTenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'impersonation_grants_targetUserId_fkey'
      AND table_name = 'impersonation_grants'
  ) THEN
    ALTER TABLE "impersonation_grants"
      ADD CONSTRAINT "impersonation_grants_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;
