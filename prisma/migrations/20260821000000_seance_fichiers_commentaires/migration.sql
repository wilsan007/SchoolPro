-- ============================================================
-- Migration : seance_fichiers_commentaires
-- Ajout des fichiers attachés et commentaires au cahier journal.
--   - seances_pedagogiques.fichiers : JSON array [{name, type, size, data}]
--   - seance_commentaires : commentaires des CPE/direction sur les séances
-- ============================================================

ALTER TABLE "seances_pedagogiques" ADD COLUMN IF NOT EXISTS "fichiers" JSONB;

CREATE TABLE IF NOT EXISTS "seance_commentaires" (
  "id"        TEXT NOT NULL,
  "seanceId"  TEXT NOT NULL,
  "auteurId"  TEXT,
  "contenu"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "seance_commentaires_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "seance_commentaires"
  ADD CONSTRAINT "seance_commentaires_seanceId_fkey"
  FOREIGN KEY ("seanceId") REFERENCES "seances_pedagogiques"("id") ON DELETE CASCADE;

ALTER TABLE "seance_commentaires"
  ADD CONSTRAINT "seance_commentaires_auteurId_fkey"
  FOREIGN KEY ("auteurId") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "seance_commentaires_seanceId_idx" ON "seance_commentaires"("seanceId");
