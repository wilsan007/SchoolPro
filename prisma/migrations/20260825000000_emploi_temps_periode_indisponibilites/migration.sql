-- ============================================================
-- Migration : periodeId sur EmploiTemps + IndisponibiliteEnseignant
-- ============================================================

-- 1. Ajout de periodeId sur emplois_temps (nullable, pas de NOT NULL
--    pour préserver les créneaux existants qui sont annuels)
ALTER TABLE "emplois_temps" ADD COLUMN "periodeId" TEXT;

-- FK vers periodes (SetNull on delete : si une période est supprimée,
-- le créneau redevient annuel plutôt que de disparaître)
ALTER TABLE "emplois_temps"
  ADD CONSTRAINT "emplois_temps_periodeId_fkey"
  FOREIGN KEY ("periodeId") REFERENCES "periodes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "emplois_temps_periodeId_idx" ON "emplois_temps"("periodeId");

-- 2. Table des indisponibilités enseignants
CREATE TABLE "indisponibilites_enseignants" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "siteId"        TEXT,
  "enseignantId"  TEXT NOT NULL,
  "jour"          "Jour" NOT NULL,
  "heureDebut"    TEXT NOT NULL,
  "heureFin"      TEXT NOT NULL,
  "source"        TEXT NOT NULL DEFAULT 'SAISIE_MANUELLE',
  "sourceLibelle" TEXT,
  "periodeId"     TEXT,
  "anneeLibelle"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "indisponibilites_enseignants_pkey" PRIMARY KEY ("id")
);

-- Relations
ALTER TABLE "indisponibilites_enseignants"
  ADD CONSTRAINT "indisponibilites_enseignants_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "indisponibilites_enseignants"
  ADD CONSTRAINT "indisponibilites_enseignants_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "indisponibilites_enseignants"
  ADD CONSTRAINT "indisponibilites_enseignants_enseignantId_fkey"
  FOREIGN KEY ("enseignantId") REFERENCES "enseignants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "indisponibilites_enseignants"
  ADD CONSTRAINT "indisponibilites_enseignants_periodeId_fkey"
  FOREIGN KEY ("periodeId") REFERENCES "periodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index
CREATE INDEX "indisponibilites_enseignants_tenantId_idx" ON "indisponibilites_enseignants"("tenantId");
CREATE INDEX "indisponibilites_enseignants_siteId_idx" ON "indisponibilites_enseignants"("siteId");
CREATE INDEX "indisponibilites_enseignants_enseignantId_idx" ON "indisponibilites_enseignants"("enseignantId");
CREATE INDEX "indisponibilites_enseignants_periodeId_idx" ON "indisponibilites_enseignants"("periodeId");
