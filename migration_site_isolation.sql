-- ============================================================
-- MIGRATION: Isolation multi-sites (Option 3 — RLS)
-- Ajout de siteId sur les tables d'entités indépendantes
-- Les tables enfants (Absence, Note, Bulletin, etc.) sont filtrées
-- via sous-requête RLS vers leur parent (Eleve, Classe, etc.)
-- ============================================================

-- 1. Ajouter siteId sur les tables d'entités indépendantes
--    (nullable = non rattaché à un site = visible par tous les sites)

-- ELEVES
ALTER TABLE public.eleves ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_eleves_siteId ON public.eleves("siteId");

-- EXAMENS
ALTER TABLE public.examens ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_examens_siteId ON public.examens("siteId");

-- EVENEMENTS
ALTER TABLE public.evenements ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_evenements_siteId ON public.evenements("siteId");

-- NOTIFICATIONS
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_siteId ON public.notifications("siteId");

-- CANDIDATURES
ALTER TABLE public.candidatures ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_candidatures_siteId ON public.candidatures("siteId");

-- INVENTAIRE
ALTER TABLE public.inventaire ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventaire_siteId ON public.inventaire("siteId");

-- COURS (e-learning)
ALTER TABLE public.cours ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cours_siteId ON public.cours("siteId");

-- ALUMNI
ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_siteId ON public.alumni("siteId");

-- 2. Rattacher les enregistrements existants au site par défaut du tenant
--    (si un site par défaut existe pour ce tenant)
UPDATE public.eleves e
SET "siteId" = s.id
FROM public.sites s
WHERE e."tenantId" = s."tenantId"
  AND e."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = e."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );

UPDATE public.examens ex
SET "siteId" = s.id
FROM public.sites s
WHERE ex."tenantId" = s."tenantId"
  AND ex."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = ex."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );

UPDATE public.evenements ev
SET "siteId" = s.id
FROM public.sites s
WHERE ev."tenantId" = s."tenantId"
  AND ev."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = ev."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );

UPDATE public.notifications n
SET "siteId" = s.id
FROM public.sites s
WHERE n."tenantId" = s."tenantId"
  AND n."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = n."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );

UPDATE public.candidatures c
SET "siteId" = s.id
FROM public.sites s
WHERE c."tenantId" = s."tenantId"
  AND c."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = c."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );

UPDATE public.inventaire i
SET "siteId" = s.id
FROM public.sites s
WHERE i."tenantId" = s."tenantId"
  AND i."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = i."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );

UPDATE public.cours c
SET "siteId" = s.id
FROM public.sites s
WHERE c."tenantId" = s."tenantId"
  AND c."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = c."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );

UPDATE public.alumni a
SET "siteId" = s.id
FROM public.sites s
WHERE a."tenantId" = s."tenantId"
  AND a."siteId" IS NULL
  AND s.id = (
    SELECT s2.id FROM public.sites s2
    WHERE s2."tenantId" = a."tenantId"
    ORDER BY s2."createdAt" ASC
    LIMIT 1
  );
