-- ============================================================
-- MANUAL-06 — Tables du workflow de réinscription
--
-- Le schéma Prisma déclare `campagne_reinscription` et
-- `invitation_reinscription`, mais la base de démonstration — construite par
-- chargement de dumps, non par rejeu des migrations — ne les a jamais reçues.
-- Toute requête Prisma sur ces tables échoue, et le moteur de tâches
-- (scannerReinscriptionsEnAttente) fait tomber le tableau de bord Direction.
--
-- REJOUABLE : IF NOT EXISTS partout ; relancer ce fichier est sans effet.
-- ============================================================

-- ── Campagne de réinscription ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.campagne_reinscription (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "libelle"         TEXT NOT NULL,
  "anneeSource"     TEXT NOT NULL,
  "anneeCible"      TEXT NOT NULL,
  "statut"          TEXT NOT NULL DEFAULT 'BROUILLON',
  "etapeActuelle"   INTEGER NOT NULL DEFAULT 1,
  "nbElevesTotal"   INTEGER NOT NULL DEFAULT 0,
  "nbReinscrits"    INTEGER NOT NULL DEFAULT 0,
  "nbNonReinscrits" INTEGER NOT NULL DEFAULT 0,
  "nbDiplomes"      INTEGER NOT NULL DEFAULT 0,
  "revenusPrevus"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dateDebut"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateFin"         TIMESTAMP(3),
  "creeParId"       TEXT,
  CONSTRAINT "campagne_reinscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "campagne_reinscription_tenantId_idx"
  ON public.campagne_reinscription("tenantId");
CREATE INDEX IF NOT EXISTS "campagne_reinscription_tenantId_statut_idx"
  ON public.campagne_reinscription("tenantId", "statut");

-- ── Invitation de réinscription ────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitation_reinscription (
  "id"                TEXT NOT NULL,
  "tenantId"          TEXT NOT NULL,
  "campagneId"        TEXT NOT NULL,
  "eleveId"           TEXT NOT NULL,
  "statut"            TEXT NOT NULL DEFAULT 'INVITE',
  "dateInvitation"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dateReponse"       TIMESTAMP(3),
  "canal"             TEXT NOT NULL DEFAULT 'WHATSAPP',
  "parentPhone"       TEXT,
  "parentEmail"       TEXT,
  "nbRelances"        INTEGER NOT NULL DEFAULT 0,
  "derniereRelance"   TIMESTAMP(3),
  "decisionPromotion" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitation_reinscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "invitation_reinscription_tenantId_idx"
  ON public.invitation_reinscription("tenantId");
CREATE INDEX IF NOT EXISTS "invitation_reinscription_campagneId_idx"
  ON public.invitation_reinscription("campagneId");
CREATE INDEX IF NOT EXISTS "invitation_reinscription_eleveId_idx"
  ON public.invitation_reinscription("eleveId");
CREATE INDEX IF NOT EXISTS "invitation_reinscription_tenantId_statut_idx"
  ON public.invitation_reinscription("tenantId", "statut");

-- ── Clés étrangères (ajoutées seulement si absentes) ───────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campagne_reinscription_tenantId_fkey') THEN
    ALTER TABLE public.campagne_reinscription
      ADD CONSTRAINT "campagne_reinscription_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES public.tenants("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitation_reinscription_campagneId_fkey') THEN
    ALTER TABLE public.invitation_reinscription
      ADD CONSTRAINT "invitation_reinscription_campagneId_fkey"
      FOREIGN KEY ("campagneId") REFERENCES public.campagne_reinscription("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitation_reinscription_eleveId_fkey') THEN
    ALTER TABLE public.invitation_reinscription
      ADD CONSTRAINT "invitation_reinscription_eleveId_fkey"
      FOREIGN KEY ("eleveId") REFERENCES public.eleves("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ── Isolation multi-établissement (RLS), comme les 122 autres tables ──
ALTER TABLE public.campagne_reinscription  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_reinscription ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campagne_reinscription_tenant_isolation ON public.campagne_reinscription;
CREATE POLICY campagne_reinscription_tenant_isolation ON public.campagne_reinscription
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

DROP POLICY IF EXISTS invitation_reinscription_tenant_isolation ON public.invitation_reinscription;
CREATE POLICY invitation_reinscription_tenant_isolation ON public.invitation_reinscription
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- ── Contrôle ───────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'campagne_reinscription')  AS campagne_ok,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'invitation_reinscription') AS invitation_ok;
