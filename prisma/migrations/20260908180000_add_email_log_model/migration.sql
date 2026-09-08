-- ============================================================
-- EmailLog : journal des emails transactionnels (Resend)
-- ============================================================
-- Trace chaque email envoyé via Resend et son statut de délivrance,
-- mis à jour par le webhook /api/webhooks/resend.
--
-- Migration additive : création de table uniquement, aucune suppression.
-- Les types de tenantId et envoyeParId s'adaptent au type réel de
-- tenants.id et users.id (text ou uuid selon la base).

-- Détection du type de tenants.id et users.id
DO $$
DECLARE
    tenant_id_type text;
    user_id_type text;
BEGIN
    SELECT data_type INTO tenant_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'id';

    SELECT data_type INTO user_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id';

    -- Création de la table avec les types adaptés
    IF tenant_id_type = 'uuid' AND user_id_type = 'uuid' THEN
        CREATE TABLE IF NOT EXISTS "email_logs" (
            "id"              TEXT NOT NULL,
            "tenantId"        UUID,
            "to"              TEXT NOT NULL,
            "subject"         TEXT NOT NULL,
            "resendId"        TEXT,
            "statut"          TEXT NOT NULL DEFAULT 'PENDING',
            "erreur"          TEXT,
            "deliveredAt"     TIMESTAMP(3),
            "bouncedAt"       TIMESTAMP(3),
            "openedAt"        TIMESTAMP(3),
            "complainedAt"    TIMESTAMP(3),
            "type"            TEXT,
            "resourceId"      TEXT,
            "envoyeParId"     UUID,
            "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"       TIMESTAMP(3) NOT NULL,
            CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
        );
    ELSE
        CREATE TABLE IF NOT EXISTS "email_logs" (
            "id"              TEXT NOT NULL,
            "tenantId"        TEXT,
            "to"              TEXT NOT NULL,
            "subject"         TEXT NOT NULL,
            "resendId"        TEXT,
            "statut"          TEXT NOT NULL DEFAULT 'PENDING',
            "erreur"          TEXT,
            "deliveredAt"     TIMESTAMP(3),
            "bouncedAt"       TIMESTAMP(3),
            "openedAt"        TIMESTAMP(3),
            "complainedAt"    TIMESTAMP(3),
            "type"            TEXT,
            "resourceId"      TEXT,
            "envoyeParId"     TEXT,
            "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"       TIMESTAMP(3) NOT NULL,
            CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
        );
    END IF;
END $$;

-- Index pour la corrélation webhook (recherche par resendId)
CREATE INDEX IF NOT EXISTS "email_logs_resendId_idx" ON "email_logs"("resendId");
-- Index pour le filtrage par tenant (page journal)
CREATE INDEX IF NOT EXISTS "email_logs_tenantId_idx" ON "email_logs"("tenantId");
-- Index pour la recherche par destinataire
CREATE INDEX IF NOT EXISTS "email_logs_to_idx" ON "email_logs"("to");
-- Index pour le filtrage par statut (stats dashboard)
CREATE INDEX IF NOT EXISTS "email_logs_statut_idx" ON "email_logs"("statut");
-- Index pour le tri par date (pagination)
CREATE INDEX IF NOT EXISTS "email_logs_createdAt_idx" ON "email_logs"("createdAt");

-- Contrainte d'unicité sur resendId (un ID Resend = un email)
CREATE UNIQUE INDEX IF NOT EXISTS "email_logs_resendId_key" ON "email_logs"("resendId");

-- Clé étrangère vers le tenant (SetNull si le tenant est supprimé)
ALTER TABLE "email_logs"
    DROP CONSTRAINT IF EXISTS "email_logs_tenantId_fkey";
ALTER TABLE "email_logs"
    ADD CONSTRAINT "email_logs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Clé étrangère vers l'utilisateur qui a déclenché l'envoi (SetNull si supprimé)
ALTER TABLE "email_logs"
    DROP CONSTRAINT IF EXISTS "email_logs_envoyeParId_fkey";
ALTER TABLE "email_logs"
    ADD CONSTRAINT "email_logs_envoyeParId_fkey"
    FOREIGN KEY ("envoyeParId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
