-- ============================================================
-- MIGRATION: Multi-sites (Option 3 — hybride)
-- Ajout du modèle Site + siteId sur Salle, Classe, Facture, User
-- + table de liaison EnseignantSite
-- ============================================================

-- 1. Créer la table sites
CREATE TABLE IF NOT EXISTS public.sites (
  id         TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  code       TEXT,
  adresse    TEXT,
  ville      TEXT,
  telephone  TEXT,
  email      TEXT,
  actif      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_tenantId ON public.sites("tenantId");

-- 2. Créer la table de liaison enseignant_sites
CREATE TABLE IF NOT EXISTS public.enseignant_sites (
  id            TEXT PRIMARY KEY,
  "enseignantId" TEXT NOT NULL REFERENCES public.enseignants(id) ON DELETE CASCADE,
  "siteId"      TEXT NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("enseignantId", "siteId")
);

CREATE INDEX IF NOT EXISTS idx_enseignant_sites_enseignantId ON public.enseignant_sites("enseignantId");
CREATE INDEX IF NOT EXISTS idx_enseignant_sites_siteId ON public.enseignant_sites("siteId");

-- 3. Ajouter siteId sur les tables existantes (nullable = tous sites)
ALTER TABLE public.salles   ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.classes  ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.users    ADD COLUMN IF NOT EXISTS "siteId" TEXT REFERENCES public.sites(id) ON DELETE SET NULL;

-- 4. Indexer les nouvelles colonnes
CREATE INDEX IF NOT EXISTS idx_salles_siteId   ON public.salles("siteId");
CREATE INDEX IF NOT EXISTS idx_classes_siteId  ON public.classes("siteId");
CREATE INDEX IF NOT EXISTS idx_factures_siteId ON public.factures("siteId");
CREATE INDEX IF NOT EXISTS idx_users_siteId    ON public.users("siteId");

-- 5. Seed: créer un site par défaut pour le tenant cly-djibouti-tenant-0001
INSERT INTO public.sites (id, "tenantId", nom, code, adresse, ville, telephone, email, actif)
VALUES (
  'cly-site-principal',
  'cly-djibouti-tenant-0001',
  'Campus Principal',
  'SITE-01',
  'Djibouti, Rue de l''Indépendance',
  'Djibouti',
  '+253 21 00 00 00',
  'contact@lycee-djibouti.dj',
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 6. Rattacher les salles existantes au site par défaut
UPDATE public.salles SET "siteId" = 'cly-site-principal'
WHERE "tenantId" = 'cly-djibouti-tenant-0001' AND "siteId" IS NULL;

-- 7. Rattacher les classes existantes au site par défaut
UPDATE public.classes SET "siteId" = 'cly-site-principal'
WHERE "tenantId" = 'cly-djibouti-tenant-0001' AND "siteId" IS NULL;
