-- Migration additive : sessionVersion sur User (AUTH-H1, audit v2)
-- Version de session incrémentée à chaque changement sensible.
-- Le callback jwt compare cette valeur avec celle du token pour
-- invalider les sessions après un changement sensible.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
