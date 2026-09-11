-- Migration additive : TacheCronExecution (AUT-H1, audit v2)
-- Ledger d'idempotence du répartiteur cron. Empêche les exécutions
-- multiples d'une même tâche dans la même fenêtre temporelle.

CREATE TABLE IF NOT EXISTS "tache_cron_executions" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fenetre" TIMESTAMP(3) NOT NULL,
    "executeeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultat" JSONB,

    CONSTRAINT "tache_cron_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tache_cron_executions_nom_fenetre_key"
  ON "tache_cron_executions"("nom", "fenetre");

CREATE INDEX IF NOT EXISTS "tache_cron_executions_nom_fenetre_idx"
  ON "tache_cron_executions"("nom", "fenetre");
