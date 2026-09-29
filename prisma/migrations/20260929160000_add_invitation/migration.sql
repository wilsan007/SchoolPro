-- ============================================================
-- Invitations d'utilisateurs par email
-- ============================================================
-- ADDITIVE (règle 5) : cette migration ne crée que l'enum `InvitationStatus`,
-- la table `invitations`, ses index et ses clés étrangères. Elle ne supprime et
-- ne modifie RIEN d'existant.
--
-- POURQUOI ÉCRITE À LA MAIN, ET NON GÉNÉRÉE
-- Le DDL ci-dessous provient bien de `prisma migrate diff` (donc des noms
-- d'index et de contraintes exactement conformes à ce que Prisma attend), mais
-- le diff COMPLET a été écarté : il contenait aussi des corrections de DÉRIVE
-- sans rapport avec cette table — suppression puis recréation de 5 clés
-- étrangères (`impersonation_grants`, `learnos_event_deadletters`) pour ajouter
-- `ON UPDATE CASCADE`, suppression d'un index (`seances_pedagogiques_emploiTempsId_idx`)
-- et retrait d'un défaut sur `rate_limit_counters."updatedAt"`.
--
-- Ces écarts méritent leur propre examen : je ne supprime pas un index ni une
-- clé étrangère dans la migration qui introduit une fonctionnalité. Le sujet
-- est consigné dans docs/CONSTATS/derive-schema-base-20260929.md.
--
-- IDEMPOTENTE : rejouable sans effet si les objets existent déjà.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvitationStatus') THEN
    CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "invitations" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "siteId"      TEXT,
  "email"       TEXT NOT NULL,
  "name"        TEXT,
  "role"        "Role" NOT NULL DEFAULT 'TEACHER',
  "phone"       TEXT,
  -- Empreinte SHA-256 du jeton : le jeton brut ne touche jamais la base.
  "tokenHash"   TEXT NOT NULL,
  "status"      "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "acceptedAt"  TIMESTAMP(3),
  "revokedAt"   TIMESTAMP(3),
  "invitedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE INDEX IF NOT EXISTS "invitations_tenantId_status_idx" ON "invitations"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "invitations_tenantId_email_idx" ON "invitations"("tenantId", "email");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_tenantId_fkey') THEN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_siteId_fkey') THEN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_invitedById_fkey') THEN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey"
      FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS : la table est tenant-scopée. Les politiques sont générées depuis le
-- schéma par `pnpm rls:generate` (nouvelle entrée `invitations` automatique).
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;