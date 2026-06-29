-- Migration SQL pour ajouter les statistiques au bulletin et créer la table de détail par matière

-- Ajout des nouvelles colonnes à la table "bulletins"
ALTER TABLE "bulletins" ADD COLUMN "moyenneClasse" DOUBLE PRECISION;
ALTER TABLE "bulletins" ADD COLUMN "moyennePremier" DOUBLE PRECISION;
ALTER TABLE "bulletins" ADD COLUMN "heuresAbsence" INTEGER DEFAULT 0;

-- Création de la table "bulletin_matieres"
CREATE TABLE "bulletin_matieres" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bulletinId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "nomProfesseur" TEXT,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "moyenneEleve" DOUBLE PRECISION,
    "rang" INTEGER,
    "moyenneMax" DOUBLE PRECISION,
    "moyenneMin" DOUBLE PRECISION,
    "appreciation" TEXT,

    CONSTRAINT "bulletin_matieres_pkey" PRIMARY KEY ("id")
);

-- Ajout des clés étrangères (Relations)
ALTER TABLE "bulletin_matieres" ADD CONSTRAINT "bulletin_matieres_bulletinId_fkey" FOREIGN KEY ("bulletinId") REFERENCES "bulletins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bulletin_matieres" ADD CONSTRAINT "bulletin_matieres_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
