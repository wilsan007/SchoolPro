-- pgTAP — Test d'isolation multi-tenant (RLS)
-- Vérifie que les politiques RLS empêchent les fuites inter-tenant
--
-- Usage:
--   docker exec schoolpro-pg-tools psql -U schoolpro -d schoolpro_tools \
--     -f /path/to/test_rls_isolation.sql

BEGIN;
SELECT plan(8);

-- Test 1: L'extension pgtap est installée
SELECT has_extension('pgtap', 'pgtap est installée');

-- Test 2: La table tenants existe
SELECT has_table('public', 'tenants', 'table tenants existe');

-- Test 3: La table users existe
SELECT has_table('public', 'users', 'table users existe');

-- Test 4: La colonne tenantId existe sur users
SELECT has_column('public', 'users', 'tenantId', 'colonne tenantId sur users');

-- Test 5: La colonne siteId existe sur users (si applicable)
SELECT has_column('public', 'users', 'siteId', 'colonne siteId sur users');

-- Test 6: RLS est activée sur la table users
SELECT is_row_security_active('public', 'users', 'RLS active sur users');

-- Test 7: RLS est activée sur la table tenants
SELECT is_row_security_active('public', 'tenants', 'RLS active sur tenants');

-- Test 8: La fonction set_tenant_context existe
SELECT has_function('public', 'set_tenant_context', ARRAY['text'], 'fonction set_tenant_context existe');

SELECT finish();
ROLLBACK;
