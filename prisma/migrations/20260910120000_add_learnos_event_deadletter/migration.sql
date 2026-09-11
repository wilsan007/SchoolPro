-- Migration additive : Dead-letter queue pour les événements LEARNOS abandonnés.
--
-- Quand un événement dépasse MAX_ATTEMPTS (5), il est déplacé de
-- `learnos_events` vers cette table. Cela sépare le trafic sain du trafic
-- en échec, et permet à un opérateur de le rejouer après correction.
--
-- Idempotente : toutes les instructions vérifient l'existence préalable.

-- 1. Créer la table si elle n'existe pas.
CREATE TABLE IF NOT EXISTS "learnos_event_deadletters" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "siteId"          TEXT,
  "eventType"       TEXT NOT NULL,
  "aggregateType"   TEXT NOT NULL,
  "aggregateId"     TEXT NOT NULL,
  "payload"         JSONB NOT NULL,
  "occurredAt"      TIMESTAMP(3) NOT NULL,
  "deadletteredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts"        INTEGER NOT NULL,
  "lastError"       TEXT,
  "resolution"      TEXT NOT NULL DEFAULT 'PENDING',

  CONSTRAINT "learnos_event_deadletters_pkey" PRIMARY KEY ("id")
);

-- 2. Contraintes de clé étrangère.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'learnos_event_deadletters_tenantId_fkey'
      AND table_name = 'learnos_event_deadletters'
  ) THEN
    ALTER TABLE "learnos_event_deadletters"
      ADD CONSTRAINT "learnos_event_deadletters_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'learnos_event_deadletters_siteId_fkey'
      AND table_name = 'learnos_event_deadletters'
  ) THEN
    ALTER TABLE "learnos_event_deadletters"
      ADD CONSTRAINT "learnos_event_deadletters_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Index.
CREATE INDEX IF NOT EXISTS "learnos_event_deadletters_tenantId_idx"
  ON "learnos_event_deadletters" ("tenantId");
CREATE INDEX IF NOT EXISTS "learnos_event_deadletters_siteId_idx"
  ON "learnos_event_deadletters" ("siteId");
CREATE INDEX IF NOT EXISTS "learnos_event_deadletters_resolution_idx"
  ON "learnos_event_deadletters" ("resolution");
CREATE INDEX IF NOT EXISTS "learnos_event_deadletters_eventType_idx"
  ON "learnos_event_deadletters" ("eventType");
