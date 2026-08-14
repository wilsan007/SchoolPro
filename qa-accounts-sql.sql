-- ============================================================
-- SCHOOLPRO QA ACCOUNTS
-- Tenant: demo-learnos
-- Created: 2026-08-13
-- ============================================================

-- TENANT: Lycée de démonstration
INSERT INTO "tenants" (id, slug, name, "logoUrl", "planType", "isActive", "createdAt", "updatedAt")
VALUES ('cmsr213n70000zbfuirwopmuo', 'demo-learnos', 'Lycée de démonstration', NULL, 'PREMIUM', true, '2026-08-13 08:48:18', '2026-08-13 08:48:18')
ON CONFLICT (id) DO NOTHING;

-- SITE: Campus Central
INSERT INTO "sites" (id, "tenantId", nom, ville, "createdAt", "updatedAt")
VALUES ('cmsr213y50002zbfu9nhx0gud', 'cmsr213n70000zbfuirwopmuo', 'Campus Central', NULL, '2026-08-13 08:48:20', '2026-08-13 08:48:20')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- QA USERS (5 comptes pour tester tous les rôles)
-- Mot de passe commun: Demo@2026! (bcrypt hash)
-- ============================================================

-- Admin / Direction (TENANT_ADMIN)
INSERT INTO "users" (id, "tenantId", "siteId", email, password, name, "firstName", "lastName", "avatarUrl", phone, role, "isActive", "lastLoginAt", langue, locale, notifications, "createdAt", "updatedAt")
VALUES (
  'cmsra09zt0001zbxc2rtm5oip',
  'cmsr213n70000zbfuirwopmuo',
  'cmsr213y50002zbfu9nhx0gud',
  'admin@qa-learnos.test',
  '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO',
  'QA Direction',
  NULL,
  NULL,
  NULL,
  NULL,
  'TENANT_ADMIN',
  true,
  NULL,
  'fr',
  'fr',
  NULL,
  '2026-08-13 08:48:32',
  '2026-08-13 08:48:32'
)
ON CONFLICT (email) DO NOTHING;

-- Enseignant (TEACHER)
INSERT INTO "users" (id, "tenantId", "siteId", email, password, name, "firstName", "lastName", "avatarUrl", phone, role, "isActive", "lastLoginAt", langue, locale, notifications, "createdAt", "updatedAt")
VALUES (
  'cmsra0caz0007zbxcxofo9xsl',
  'cmsr213n70000zbfuirwopmuo',
  'cmsr213y50002zbfu9nhx0gud',
  'prof@qa-learnos.test',
  '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO',
  'QA Enseignant',
  NULL,
  NULL,
  NULL,
  NULL,
  'TEACHER',
  true,
  NULL,
  'fr',
  'fr',
  NULL,
  '2026-08-13 08:48:35',
  '2026-08-13 08:48:35'
)
ON CONFLICT (email) DO NOTHING;

-- Prof Principal (CLASS_TEACHER)
INSERT INTO "users" (id, "tenantId", "siteId", email, password, name, "firstName", "lastName", "avatarUrl", phone, role, "isActive", "lastLoginAt", langue, locale, notifications, "createdAt", "updatedAt")
VALUES (
  'cmsra0ek8000dzbxc1x09tm9e',
  'cmsr213n70000zbfuirwopmuo',
  'cmsr213y50002zbfu9nhx0gud',
  'pp@qa-learnos.test',
  '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO',
  'QA Prof Principal',
  NULL,
  NULL,
  NULL,
  NULL,
  'CLASS_TEACHER',
  true,
  NULL,
  'fr',
  'fr',
  NULL,
  '2026-08-13 08:48:38',
  '2026-08-13 08:48:38'
)
ON CONFLICT (email) DO NOTHING;

-- Parent (PARENT)
INSERT INTO "users" (id, "tenantId", "siteId", email, password, name, "firstName", "lastName", "avatarUrl", phone, role, "isActive", "lastLoginAt", langue, locale, notifications, "createdAt", "updatedAt")
VALUES (
  'cmsra0gu5000jzbxclctlrpe7',
  'cmsr213n70000zbfuirwopmuo',
  'cmsr213y50002zbfu9nhx0gud',
  'parent@qa-learnos.test',
  '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO',
  'QA Parent',
  NULL,
  NULL,
  NULL,
  NULL,
  'PARENT',
  true,
  NULL,
  'fr',
  'fr',
  NULL,
  '2026-08-13 08:48:40',
  '2026-08-13 08:48:40'
)
ON CONFLICT (email) DO NOTHING;

-- Élève (STUDENT)
INSERT INTO "users" (id, "tenantId", "siteId", email, password, name, "firstName", "lastName", "avatarUrl", phone, role, "isActive", "lastLoginAt", langue, locale, notifications, "createdAt", "updatedAt")
VALUES (
  'cmsra0j9x000pzbxcrkfaq0ho',
  'cmsr213n70000zbfuirwopmuo',
  'cmsr213y50002zbfu9nhx0gud',
  'eleve@qa-learnos.test',
  '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO',
  'QA Élève',
  NULL,
  NULL,
  NULL,
  NULL,
  'STUDENT',
  true,
  NULL,
  'fr',
  'fr',
  NULL,
  '2026-08-13 08:48:43',
  '2026-08-13 08:48:43'
)
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- USER_TENANT ASSOCIATIONS
-- ============================================================

INSERT INTO "user_tenants" (id, "userId", "tenantId", role, "isActive", "isDefault", "createdAt", "updatedAt")
VALUES
  ('cmsra0aru0003zbxc3kto6okc', 'cmsra09zt0001zbxc2rtm5oip', 'cmsr213n70000zbfuirwopmuo', 'TENANT_ADMIN', true, true, '2026-08-13 08:48:32', '2026-08-13 08:48:32'),
  ('cmsra0d260009zbxcujlbtg3i', 'cmsra0caz0007zbxcxofo9xsl', 'cmsr213n70000zbfuirwopmuo', 'TEACHER', true, true, '2026-08-13 08:48:35', '2026-08-13 08:48:35'),
  ('cmsra0fb9000fzbxc8yxw7pmv', 'cmsra0ek8000dzbxc1x09tm9e', 'cmsr213n70000zbfuirwopmuo', 'CLASS_TEACHER', true, true, '2026-08-13 08:48:38', '2026-08-13 08:48:38'),
  ('cmsra0hlc000lzbxcwmxpebpi', 'cmsra0gu5000jzbxclctlrpe7', 'cmsr213n70000zbfuirwopmuo', 'PARENT', true, true, '2026-08-13 08:48:40', '2026-08-13 08:48:40'),
  ('cmsra0k17000rzbxctlmoaams', 'cmsra0j9x000pzbxcrkfaq0ho', 'cmsr213n70000zbfuirwopmuo', 'STUDENT', true, true, '2026-08-13 08:48:44', '2026-08-13 08:48:44')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- IDENTIFIANTS DE CONNEXION
-- ============================================================
-- Email                     | Password      | Rôle
-- ============================================================
-- admin@qa-learnos.test     | Demo@2026!    | Admin/Direction
-- prof@qa-learnos.test      | Demo@2026!    | Enseignant
-- pp@qa-learnos.test        | Demo@2026!    | Prof Principal
-- parent@qa-learnos.test    | Demo@2026!    | Parent
-- eleve@qa-learnos.test     | Demo@2026!    | Élève
-- ============================================================
