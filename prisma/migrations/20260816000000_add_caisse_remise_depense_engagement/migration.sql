-- ============================================================
-- Migration : add_caisse_remise_depense_engagement
-- 1. Nouveau rôle CAISSIER dans l'enum Role
-- 2. Champ dateSaisie sur les paiements (date de saisie automatique)
-- 3. Champs de traçabilité sur les dépenses (autorisation, paiement, engagement fournisseur)
-- 4. Nouveau modèle RemiseCaisse (remise des recettes journalières avec double validation)
-- ============================================================

-- ── 1. Ajouter le rôle CAISSIER à l'enum Role ─────────────────
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CAISSIER';

-- ── 2. Table : paiements — ajouter dateSaisie ──────────────────
-- Date de saisie automatique (jour de la saisie), identique à la date du reçu.
ALTER TABLE "paiements" ADD COLUMN IF NOT EXISTS "dateSaisie" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── 3. Table : depenses — traçabilité de l'engagement ──────────
-- Personne qui a autorisé l'engagement de cette dépense
ALTER TABLE "depenses" ADD COLUMN IF NOT EXISTS "autoriseParId" TEXT;
-- Personne qui a effectué le paiement
ALTER TABLE "depenses" ADD COLUMN IF NOT EXISTS "payeParId" TEXT;
-- Type d'engagement auprès du fournisseur
ALTER TABLE "depenses" ADD COLUMN IF NOT EXISTS "typeEngagement" TEXT;
-- Nom du fournisseur / prestataire
ALTER TABLE "depenses" ADD COLUMN IF NOT EXISTS "fournisseur" TEXT;
-- Contact du fournisseur (téléphone, email, adresse)
ALTER TABLE "depenses" ADD COLUMN IF NOT EXISTS "fournisseurContact" TEXT;

-- Clés étrangères pour les nouvelles relations
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_autoriseParId_fkey"
  FOREIGN KEY ("autoriseParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_payeParId_fkey"
  FOREIGN KEY ("payeParId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 4a. Enum : StatutRemiseCaisse ──────────────────────────────
-- Créé avant la table qui le référence.
DO $$ BEGIN
  CREATE TYPE "StatutRemiseCaisse" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'REJETE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 4b. Table : remises_caisse ─────────────────────────────────
-- Remise des recettes de la journée par le caissier à un receveur
-- (comptable ou directeur). Double validation : le receveur doit confirmer
-- avoir reçu le même montant, à la même date, de la part du même caissier.
CREATE TABLE IF NOT EXISTS "remises_caisse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "siteId" TEXT,
  "caissierId" TEXT NOT NULL,
  "montantDeclare" DOUBLE PRECISION NOT NULL,
  "dateRemise" TIMESTAMP(3) NOT NULL,
  "dateSaisieRemise" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receveurId" TEXT,
  "montantRecu" DOUBLE PRECISION,
  "dateReception" TIMESTAMP(3),
  "dateSaisieReception" TIMESTAMP(3),
  "commentaireReceveur" TEXT,
  "statut" "StatutRemiseCaisse" NOT NULL DEFAULT 'EN_ATTENTE',
  "periodeDebut" TIMESTAMP(3) NOT NULL,
  "periodeFin" TIMESTAMP(3) NOT NULL,
  "devise" TEXT NOT NULL DEFAULT 'DJF',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "remises_caisse_pkey" PRIMARY KEY ("id")
);

-- ── 4c. Index ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "remises_caisse_tenantId_idx" ON "remises_caisse"("tenantId");
CREATE INDEX IF NOT EXISTS "remises_caisse_siteId_idx" ON "remises_caisse"("siteId");
CREATE INDEX IF NOT EXISTS "remises_caisse_caissierId_idx" ON "remises_caisse"("caissierId");
CREATE INDEX IF NOT EXISTS "remises_caisse_receveurId_idx" ON "remises_caisse"("receveurId");
CREATE INDEX IF NOT EXISTS "remises_caisse_statut_idx" ON "remises_caisse"("statut");
CREATE INDEX IF NOT EXISTS "remises_caisse_dateRemise_idx" ON "remises_caisse"("dateRemise");

-- ── 4d. Clés étrangères ────────────────────────────────────────
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_caissierId_fkey"
  FOREIGN KEY ("caissierId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "remises_caisse" ADD CONSTRAINT "remises_caisse_receveurId_fkey"
  FOREIGN KEY ("receveurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
