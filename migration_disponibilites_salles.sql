-- Migration: Add disponibilites_enseignants and salles tables
-- Date: 2025-07-03

CREATE TABLE IF NOT EXISTS public.disponibilites_enseignants (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId"      TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "enseignantId"  TEXT NOT NULL REFERENCES public.enseignants(id) ON DELETE CASCADE,
  jour            TEXT NOT NULL CHECK (jour IN ('DIMANCHE','LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI')),
  "heureDebut"    TEXT NOT NULL,
  "heureFin"      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dispo_ens_tenant ON public.disponibilites_enseignants("tenantId");
CREATE INDEX IF NOT EXISTS idx_dispo_ens_prof ON public.disponibilites_enseignants("enseignantId");

CREATE TABLE IF NOT EXISTS public.salles (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  capacite   INTEGER NOT NULL DEFAULT 30,
  type       TEXT,
  batiment   TEXT
);

CREATE INDEX IF NOT EXISTS idx_salles_tenant ON public.salles("tenantId");
