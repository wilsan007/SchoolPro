-- Index composites pour accélérer les requêtes filtrées par tenantId + statut + date
-- Ces index sont critiques pour le dashboard direction qui filtre par année + statut.

-- Incidents : filtré par (tenantId, statut, date) dans getTeacherDelays + file de validation
CREATE INDEX IF NOT EXISTS "incidents_tenantId_statut_date_idx"
  ON "incidents" ("tenantId", "statut", "date");

-- Évaluations : filtré par (tenantId, date, statut) dans kpisDirection + getTeacherDelays
CREATE INDEX IF NOT EXISTS "evaluations_tenantId_date_statut_idx"
  ON "evaluations" ("tenantId", "date", "statut");

-- Bulletins : filtré par (tenantId, isPublie) dans la file de validation
CREATE INDEX IF NOT EXISTS "bulletins_tenantId_isPublie_idx"
  ON "bulletins" ("tenantId", "isPublie");

-- Recommandations : filtré par (tenantId, statut, createdAt) dans kpisDirection
CREATE INDEX IF NOT EXISTS "learnos_recommandations_tenantId_statut_createdAt_idx"
  ON "learnos_recommandations" ("tenantId", "statut", "createdAt");

-- Plans progression : filtré par (tenantId, statut, createdAt) dans kpisDirection
CREATE INDEX IF NOT EXISTS "learnos_plans_progression_tenantId_statut_createdAt_idx"
  ON "learnos_plans_progression" ("tenantId", "statut", "createdAt");

-- Séances pédagogiques : filtré par (tenantId, statut, date) dans getTeacherDelays
CREATE INDEX IF NOT EXISTS "seances_pedagogiques_tenantId_statut_date_idx"
  ON "seances_pedagogiques" ("tenantId", "statut", "date");

-- Devoirs : filtré par (tenantId, statut, dateRendu) dans getTeacherDelays
CREATE INDEX IF NOT EXISTS "devoirs_tenantId_statut_dateRendu_idx"
  ON "devoirs" ("tenantId", "statut", "dateRendu");
