-- QA ACCOUNTS FOR SCHOOLPRO
-- Tenant: demo-learnos
-- Password: Demo@2026!

INSERT INTO tenants (id, slug, name, "logoUrl", plan, status, "currentYear", "notationMax", langue, timezone, currency, "createdAt", "updatedAt")
VALUES ('cmsr213n70000zbfuirwopmuo', 'demo-learnos', 'Lycee Demo', NULL, 'STARTER', 'ACTIVE', '2025-2026', 20, 'fr', 'Africa/Dakar', 'XOF', '2026-08-13 08:48:18', '2026-08-13 08:48:18')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO sites (id, "tenantId", nom, ville, "createdAt", "updatedAt")
VALUES ('cmsr213y50002zbfu9nhx0gud', 'cmsr213n70000zbfuirwopmuo', 'Campus Central', NULL, '2026-08-13 08:48:20', '2026-08-13 08:48:20')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, "tenantId", "siteId", email, password, name, "firstName", "lastName", "avatarUrl", phone, role, "isActive", "lastLoginAt", langue, locale, notifications, "createdAt", "updatedAt")
VALUES
  ('cmsra09zt0001zbxc2rtm5oip', 'cmsr213n70000zbfuirwopmuo', 'cmsr213y50002zbfu9nhx0gud', 'admin@qa-learnos.test', '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO', 'QA Direction', NULL, NULL, NULL, NULL, 'TENANT_ADMIN', true, NULL, 'fr', 'fr', NULL, '2026-08-13 08:48:32', '2026-08-13 08:48:32'),
  ('cmsra0caz0007zbxcxofo9xsl', 'cmsr213n70000zbfuirwopmuo', 'cmsr213y50002zbfu9nhx0gud', 'prof@qa-learnos.test', '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO', 'QA Enseignant', NULL, NULL, NULL, NULL, 'TEACHER', true, NULL, 'fr', 'fr', NULL, '2026-08-13 08:48:35', '2026-08-13 08:48:35'),
  ('cmsra0ek8000dzbxc1x09tm9e', 'cmsr213n70000zbfuirwopmuo', 'cmsr213y50002zbfu9nhx0gud', 'pp@qa-learnos.test', '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO', 'QA Prof Principal', NULL, NULL, NULL, NULL, 'CLASS_TEACHER', true, NULL, 'fr', 'fr', NULL, '2026-08-13 08:48:38', '2026-08-13 08:48:38'),
  ('cmsra0gu5000jzbxclctlrpe7', 'cmsr213n70000zbfuirwopmuo', 'cmsr213y50002zbfu9nhx0gud', 'parent@qa-learnos.test', '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO', 'QA Parent', NULL, NULL, NULL, NULL, 'PARENT', true, NULL, 'fr', 'fr', NULL, '2026-08-13 08:48:40', '2026-08-13 08:48:40'),
  ('cmsra0j9x000pzbxcrkfaq0ho', 'cmsr213n70000zbfuirwopmuo', 'cmsr213y50002zbfu9nhx0gud', 'eleve@qa-learnos.test', '$2a$12$DJP6ctOSO9.pvy5v7pSpyuirrPVbfFEAc/.FTUUMgOC96EM8mLMNO', 'QA Eleve', NULL, NULL, NULL, NULL, 'STUDENT', true, NULL, 'fr', 'fr', NULL, '2026-08-13 08:48:43', '2026-08-13 08:48:43')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_tenants (id, "userId", "tenantId", role, "isActive", "isDefault", "createdAt", "updatedAt")
VALUES
  ('cmsra0aru0003zbxc3kto6okc', 'cmsra09zt0001zbxc2rtm5oip', 'cmsr213n70000zbfuirwopmuo', 'TENANT_ADMIN', true, true, '2026-08-13 08:48:32', '2026-08-13 08:48:32'),
  ('cmsra0d260009zbxcujlbtg3i', 'cmsra0caz0007zbxcxofo9xsl', 'cmsr213n70000zbfuirwopmuo', 'TEACHER', true, true, '2026-08-13 08:48:35', '2026-08-13 08:48:35'),
  ('cmsra0fb9000fzbxc8yxw7pmv', 'cmsra0ek8000dzbxc1x09tm9e', 'cmsr213n70000zbfuirwopmuo', 'CLASS_TEACHER', true, true, '2026-08-13 08:48:38', '2026-08-13 08:48:38'),
  ('cmsra0hlc000lzbxcwmxpebpi', 'cmsra0gu5000jzbxclctlrpe7', 'cmsr213n70000zbfuirwopmuo', 'PARENT', true, true, '2026-08-13 08:48:40', '2026-08-13 08:48:40'),
  ('cmsra0k17000rzbxctlmoaams', 'cmsra0j9x000pzbxcrkfaq0ho', 'cmsr213n70000zbfuirwopmuo', 'STUDENT', true, true, '2026-08-13 08:48:44', '2026-08-13 08:48:44')
ON CONFLICT (id) DO NOTHING;
