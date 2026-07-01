-- ============================================================
-- SEED 01 — Tenant + Année scolaire + Périodes + User Admin
-- ============================================================

-- Tenant : Lycée de Djibouti
INSERT INTO public.tenants (id, name, slug, plan, status, "currentYear", "notationMax", langue, timezone, currency, country, city, "createdAt", "updatedAt")
VALUES (
  'cly-djibouti-tenant-0001',
  'Lycée Mohamed Hashim Ledi',
  'lycee-mohamed-hashim-ledi',
  'PRO',
  'ACTIVE',
  '2025-2026',
  20,
  'fr',
  'Africa/Djibouti',
  'DJF',
  'DJ',
  'Djibouti',
  NOW(),
  NOW()
);

-- Année scolaire
INSERT INTO public.annees_scolaires (id, "tenantId", libelle, "dateDebut", "dateFin", "isCurrent")
VALUES (
  'cly-annee-2025-2026',
  'cly-djibouti-tenant-0001',
  '2025-2026',
  '2025-09-01',
  '2026-06-30',
  true
);

-- Périodes (3 trimestres)
INSERT INTO public.periodes (id, "anneeId", nom, numero, "dateDebut", "dateFin", "isCurrent")
VALUES
  ('cly-periode-t1', 'cly-annee-2025-2026', 'Trimestre 1', 1, '2025-09-01', '2025-12-19', true),
  ('cly-periode-t2', 'cly-annee-2025-2026', 'Trimestre 2', 2, '2026-01-05', '2026-03-27', false),
  ('cly-periode-t3', 'cly-annee-2025-2026', 'Trimestre 3', 3, '2026-04-13', '2026-06-26', false);

-- User Admin (mot de passe : Demo@2026! — hashé bcrypt)
INSERT INTO public.users (id, "tenantId", email, name, "firstName", "lastName", role, "isActive", password, "createdAt", "updatedAt")
VALUES (
  'cly-user-admin-0001',
  'cly-djibouti-tenant-0001',
  'admin@lycee-djibouti.ecolpro.app',
  'Ahmed Omar Farah',
  'Ahmed',
  'Farah',
  'TENANT_ADMIN',
  true,
  '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6',
  NOW(),
  NOW()
);
