-- ============================================================
-- 01-tenant-sites-structures.sql
-- Cité Scolaire Ambouli (Djibouti)
-- Tenant + 2 Sites + 4 Structures + Admin user + SyncConfig
-- ============================================================

-- ── Nettoyage préalable (idempotent) ─────────────────────────
-- Supprime tout tenant existant avec ce slug pour éviter les
-- conflits de contrainte unique lors des ré-exécutions.
DELETE FROM sync_configs   WHERE "tenantId" = 'tenant-ambouli';
DELETE FROM sync_configs   WHERE "tenantId" IN (SELECT id FROM tenants WHERE slug = 'cite-scolaire-ambouli');
DELETE FROM structures     WHERE "tenantId" IN (SELECT id FROM tenants WHERE slug = 'cite-scolaire-ambouli');
DELETE FROM sites          WHERE "tenantId" IN (SELECT id FROM tenants WHERE slug = 'cite-scolaire-ambouli');
DELETE FROM users          WHERE "tenantId" IN (SELECT id FROM tenants WHERE slug = 'cite-scolaire-ambouli');
DELETE FROM tenants        WHERE slug = 'cite-scolaire-ambouli';
DELETE FROM tenants        WHERE id = 'tenant-ambouli';

-- ── Tenant ──────────────────────────────────────────────────
INSERT INTO tenants ("id", "name", "slug", "plan", "status", "address", "city", "country", "phone", "email", "website", "currentYear", "notationMax", "langue", "timezone", "currency", "primaryColor", "secondaryColor", "chefEtablissement", "createdAt", "updatedAt") VALUES (
  'tenant-ambouli',
  'Cité Scolaire Ambouli',
  'cite-scolaire-ambouli',
  'BUSINESS',
  'ACTIVE',
  'Boulevard de la République, Djibouti',
  'Djibouti',
  'DJ',
  '+253 21 35 12 34',
  'contact@cite-ambouli.dj',
  'https://cite-ambouli.dj',
  '2025-2026',
  20,
  'fr',
  'Africa/Djibouti',
  'DJF',
  '#1d4ed8',
  '#f59e0b',
  'M. Abdillahi Mahamoud',
  '2024-09-15 12:00:00',
  '2024-09-15 12:00:00'
)
ON CONFLICT ("id") DO NOTHING;

-- ── 2 Sites ─────────────────────────────────────────────────
INSERT INTO sites ("id", "tenantId", "nom", "code", "adresse", "ville", "telephone", "email", "actif", "createdAt", "updatedAt") VALUES
  (
    'site-ambouli',
    'tenant-ambouli',
    'Campus Ambouli',
    'AMB',
    'Quartier Ambouli, Djibouti',
    'Djibouti',
    '+253 21 35 12 35',
    'ambouli@cite-ambouli.dj',
    TRUE,
    '2024-09-15 12:00:00',
    '2024-09-15 12:00:00'
  ),
  (
    'site-arhiba',
    'tenant-ambouli',
    'Annexe Arhiba',
    'ARH',
    'Quartier Arhiba, Djibouti',
    'Djibouti',
    '+253 21 35 12 36',
    'arhiba@cite-ambouli.dj',
    TRUE,
    '2024-09-15 12:00:00',
    '2024-09-15 12:00:00'
  )
ON CONFLICT ("id") DO NOTHING;

-- ── 4 Structures (Collège + Lycée par site) ─────────────────
INSERT INTO structures ("id", "tenantId", "siteId", "type", "nom", "actif", "createdAt", "updatedAt") VALUES
  ('struct-coll-amb',  'tenant-ambouli', 'site-ambouli', 'COLLEGE', 'Collège Ambouli', TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('struct-lycee-amb', 'tenant-ambouli', 'site-ambouli', 'LYCEE',   'Lycée Ambouli',   TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('struct-coll-arh',  'tenant-ambouli', 'site-arhiba',  'COLLEGE', 'Collège Arhiba',  TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('struct-lycee-arh', 'tenant-ambouli', 'site-arhiba',  'LYCEE',   'Lycée Arhiba',    TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00')
ON CONFLICT ("id") DO NOTHING;

-- ── Admin user (TENANT_ADMIN) ───────────────────────────────
-- Mot de passe: "Ambouli@2026!" — hash bcrypt ($2a$12$…)
INSERT INTO users ("id", "tenantId", "email", "password", "name", "firstName", "lastName", "role", "isActive", "phone", "langue", "locale", "createdAt", "updatedAt") VALUES (
  'user-admin-amb',
  'tenant-ambouli',
  'admin@cite-ambouli.dj',
  '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Abdillahi Mahamoud',
  'Abdillahi',
  'Mahamoud',
  'TENANT_ADMIN',
  TRUE,
  '+253 77 12 34 01',
  'fr',
  'fr',
  '2024-09-15 12:00:00',
  '2024-09-15 12:00:00'
)
ON CONFLICT ("id") DO NOTHING;

-- ── SyncConfig (sauvegarde automatique sur PC local) ────────
INSERT INTO sync_configs ("id", "tenantId", "serverNick", "syncInterval", "syncEnabled", "apiKey", "includeBulletins", "includeNotes", "includeEmploiTemps", "includeExamens", "includePersonnel", "includeComptabilite", "includeAbsences", "includeParametres", "createdAt", "updatedAt") VALUES (
  'sync-ambouli',
  'tenant-ambouli',
  'PC-Directeur-Abdillahi',
  60,
  TRUE,
  'amb_key_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
  '2024-09-15 12:00:00',
  '2024-09-15 12:00:00'
)
ON CONFLICT ("id") DO NOTHING;
