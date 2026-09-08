-- AddEmploiTempsToSeance
-- Lie chaque séance pédagogique générée à son créneau d'emploi du temps source.
-- Colonne nullable pour compatibilité avec les séances historiques et créées manuellement.

ALTER TABLE "seances_pedagogiques" ADD COLUMN "emploiTempsId" TEXT;

ALTER TABLE "seances_pedagogiques" ADD CONSTRAINT "seances_pedagogiques_emploiTempsId_fkey" FOREIGN KEY ("emploiTempsId") REFERENCES "emplois_temps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "seances_pedagogiques_emploiTempsId_idx" ON "seances_pedagogiques"("emploiTempsId");
