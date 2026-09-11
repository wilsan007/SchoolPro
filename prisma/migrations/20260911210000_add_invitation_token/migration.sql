-- Migration additive : token + expiresAt sur InvitationReinscription (API-H3, audit v2)
-- Remplace l'ID incrémental (cuid) comme token d'accès public par un
-- token aléatoire de 32 bytes (64 hex), non énumérable.

ALTER TABLE "invitation_reinscription" ADD COLUMN IF NOT EXISTS "token" TEXT;
ALTER TABLE "invitation_reinscription" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "invitation_reinscription_token_key"
  ON "invitation_reinscription"("token");

CREATE INDEX IF NOT EXISTS "invitation_reinscription_token_idx"
  ON "invitation_reinscription"("token");
