-- ============================================================
-- MANUAL-01 : Création de la table remises_caisse + enum
-- À exécuter UNE FOIS dans Supabase SQL Editor
-- ============================================================

-- 1. Créer l'enum StatutRemiseCaisse
DO $$ BEGIN
  CREATE TYPE "StatutRemiseCaisse" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'REJETE');
EXCEPTION WHEN duplicate_object THEN END $$;

-- 2. Créer la table remises_caisse
CREATE TABLE IF NOT EXISTS "remises_caisse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "siteId" TEXT,
  "caissierId" TEXT NOT NULL,
  "montantDeclare" DOUBLE PRECISION NOT NULL,
  "dateRemise" TIMESTAMP(3) NOT NULL,
  "dateSaisieRemise" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "receveurId" TEXT,
  "montantRecu" DOUBLE PRECISION,
  "dateReception" TIMESTAMP(3),
  "dateSaisieReception" TIMESTAMP(3),
  "commentaireReceveur" TEXT,
  "statut" "StatutRemiseCaisse" NOT NULL DEFAULT 'EN_ATTENTE',
  "periodeDebut" TIMESTAMP(3) NOT NULL,
  "periodeFin" TIMESTAMP(3) NOT NULL,
  "devise" TEXT NOT NULL DEFAULT 'DJF',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "remises_caisse_pkey" PRIMARY KEY ("id")
);

-- 3. Index
CREATE INDEX IF NOT EXISTS "remises_caisse_tenantId_idx" ON "remises_caisse"("tenantId");
CREATE INDEX IF NOT EXISTS "remises_caisse_siteId_idx" ON "remises_caisse"("siteId");
CREATE INDEX IF NOT EXISTS "remises_caisse_caissierId_idx" ON "remises_caisse"("caissierId");
CREATE INDEX IF NOT EXISTS "remises_caisse_receveurId_idx" ON "remises_caisse"("receveurId");
CREATE INDEX IF NOT EXISTS "remises_caisse_statut_idx" ON "remises_caisse"("statut");
CREATE INDEX IF NOT EXISTS "remises_caisse_dateRemise_idx" ON "remises_caisse"("dateRemise");

-- 4. Foreign keys
ALTER TABLE "remises_caisse"
  ADD CONSTRAINT "remises_caisse_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "remises_caisse"
  ADD CONSTRAINT "remises_caisse_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL;

ALTER TABLE "remises_caisse"
  ADD CONSTRAINT "remises_caisse_caissierId_fkey"
  FOREIGN KEY ("caissierId") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "remises_caisse"
  ADD CONSTRAINT "remises_caisse_receveurId_fkey"
  FOREIGN KEY ("receveurId") REFERENCES "users"("id") ON DELETE SET NULL;

SELECT 'Table remises_caisse créée avec succès' AS result;
