-- AlterTable: ajouter REINSCRIT et NON_REINSCRIT au statut élève
-- PostgreSQL n'a pas d'ALTER TYPE ADD VALUE transactionnel avant PG12,
-- mais Supabase est PG14+ donc on peut utiliser ALTER TYPE ADD VALUE.
ALTER TYPE "StatutEleve" ADD VALUE IF NOT EXISTS 'REINSCRIT';
ALTER TYPE "StatutEleve" ADD VALUE IF NOT EXISTS 'NON_REINSCRIT';

-- CreateTable: CampagneReinscription
CREATE TABLE "campagne_reinscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "anneeSource" TEXT NOT NULL,
    "anneeCible" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "etapeActuelle" INTEGER NOT NULL DEFAULT 1,
    "nbElevesTotal" INTEGER NOT NULL DEFAULT 0,
    "nbReinscrits" INTEGER NOT NULL DEFAULT 0,
    "nbNonReinscrits" INTEGER NOT NULL DEFAULT 0,
    "nbDiplomes" INTEGER NOT NULL DEFAULT 0,
    "revenusPrevus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "creeParId" TEXT,

    CONSTRAINT "campagne_reinscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable: InvitationReinscription
CREATE TABLE "invitation_reinscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'INVITE',
    "dateInvitation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateReponse" TIMESTAMP(3),
    "canal" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "parentPhone" TEXT,
    "parentEmail" TEXT,
    "nbRelances" INTEGER NOT NULL DEFAULT 0,
    "derniereRelance" TIMESTAMP(3),
    "decisionPromotion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_reinscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campagne_reinscription_tenantId_idx" ON "campagne_reinscription"("tenantId");
CREATE INDEX "campagne_reinscription_tenantId_statut_idx" ON "campagne_reinscription"("tenantId", "statut");

CREATE INDEX "invitation_reinscription_tenantId_idx" ON "invitation_reinscription"("tenantId");
CREATE INDEX "invitation_reinscription_campagneId_idx" ON "invitation_reinscription"("campagneId");
CREATE INDEX "invitation_reinscription_eleveId_idx" ON "invitation_reinscription"("eleveId");
CREATE INDEX "invitation_reinscription_tenantId_statut_idx" ON "invitation_reinscription"("tenantId", "statut");

-- AddForeignKey
ALTER TABLE "campagne_reinscription"
  ADD CONSTRAINT "campagne_reinscription_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "invitation_reinscription"
  ADD CONSTRAINT "invitation_reinscription_campagneId_fkey"
  FOREIGN KEY ("campagneId") REFERENCES "campagne_reinscription"("id") ON DELETE CASCADE;

ALTER TABLE "invitation_reinscription"
  ADD CONSTRAINT "invitation_reinscription_eleveId_fkey"
  FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE CASCADE;
