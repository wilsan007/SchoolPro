-- ============================================================
-- MIGRATION MENFOP — Phase 0.3
-- Nouveaux modèles + champs pour features MENFOP
-- Idempotent : peut être ré-exécuté sans erreur.
-- ============================================================

-- 1. Champs Tenant : signature, cachet, chef d'établissement
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "cachetUrl" TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "chefEtablissement" TEXT;

-- 2. Champs Periode : clôture / prolongation
ALTER TABLE public.periodes ADD COLUMN IF NOT EXISTS "statut" TEXT NOT NULL DEFAULT 'OUVERTE';
ALTER TABLE public.periodes ADD COLUMN IF NOT EXISTS "cloturedAt" TIMESTAMPTZ;
ALTER TABLE public.periodes ADD COLUMN IF NOT EXISTS "dateLimiteSaisie" TIMESTAMPTZ;

-- 3. Champ User : locale (FR/EN interface)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'fr';

-- 4. Table : regles_appreciation
CREATE TABLE IF NOT EXISTS public.regles_appreciation (
  id        TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contexte  TEXT NOT NULL, -- NOTE_MATIERE | BULLETIN_PERIODE | BULLETIN_ANNUEL | ABSENCE
  "seuilMin" DOUBLE PRECISION NOT NULL,
  "seuilMax" DOUBLE PRECISION NOT NULL,
  libelle   TEXT NOT NULL,
  ordre     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_regles_app_tenant_contexte ON public.regles_appreciation ("tenantId", contexte);

-- 5. Table : dispenses_matiere
CREATE TABLE IF NOT EXISTS public.dispenses_matiere (
  id        TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "eleveId"  TEXT NOT NULL REFERENCES public.eleves(id) ON DELETE CASCADE,
  "matiereId" TEXT NOT NULL REFERENCES public.matieres(id) ON DELETE CASCADE,
  "periodeId" TEXT,
  motif     TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("eleveId", "matiereId", "periodeId")
);
CREATE INDEX IF NOT EXISTS idx_dispenses_tenant ON public.dispenses_matiere ("tenantId");
CREATE INDEX IF NOT EXISTS idx_dispenses_eleve ON public.dispenses_matiere ("eleveId");

-- 6. Vérification
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'tenants' AND column_name IN ('signatureUrl','cachetUrl','chefEtablissement');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'periodes' AND column_name IN ('statut','cloturedAt','dateLimiteSaisie');
-- SELECT count(*) FROM regles_appreciation;
-- SELECT count(*) FROM dispenses_matiere;
