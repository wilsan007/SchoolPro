-- ============================================================
-- Migration : incident_resolution_traceability
-- Traçabilité de la résolution et du classement des incidents.
-- Avant, on pouvait résoudre/classer un incident en un clic sans
-- documenter l'action concrètement entreprise. Désormais :
--   - actionPrise     : description de la mesure prise (obligatoire si RESOLU)
--   - resoluParId     : utilisateur ayant résolu l'incident
--   - dateResolution  : date de résolution
--   - classeParId     : utilisateur ayant classé l'incident sans suite
--   - dateClassement  : date de classement
--   - motifClassement : raison du classement sans suite (obligatoire si CLASSE)
-- ============================================================

ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "actionPrise"     TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "resoluParId"     TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "dateResolution"  TIMESTAMP(3);
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "classeParId"     TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "dateClassement"  TIMESTAMP(3);
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "motifClassement" TEXT;

-- Clés étrangères vers les utilisateurs (résolveur / classeur)
ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_resoluParId_fkey"
  FOREIGN KEY ("resoluParId") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_classeParId_fkey"
  FOREIGN KEY ("classeParId") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "incidents_resoluParId_idx" ON "incidents"("resoluParId");
CREATE INDEX IF NOT EXISTS "incidents_classeParId_idx" ON "incidents"("classeParId");
