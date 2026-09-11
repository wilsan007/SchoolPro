-- Migration additive : RateLimitCounter (AUTH-H3, audit v2)
-- Compteur atomique partagé entre instances pour le rate limit global.

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_counters_key_key" ON "rate_limit_counters"("key");
