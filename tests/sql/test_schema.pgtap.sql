-- pgTAP — Tests d'intégrité du schéma SchoolPro
-- Vérifie que les tables critiques existent et ont les bonnes colonnes
--
-- Usage:
--   pnpm audit:pgtap
--   docker exec schoolpro-pg-tools psql "$DIRECT_URL" -f tests/sql/test_schema.pgtap.sql

BEGIN;
SELECT plan(15);

-- === Tables critiques ===
SELECT has_table('public', 'tenants', 'table tenants existe');
SELECT has_table('public', 'users', 'table users existe');
SELECT has_table('public', 'eleves', 'table eleves existe');
SELECT has_table('public', 'classes', 'table classes existe');
SELECT has_table('public', 'notes', 'table notes existe');

-- === Colonnes tenantId (règle non-négociable #1) ===
SELECT has_column('public', 'users', 'tenantId', 'users.tenantId existe');
SELECT has_column('public', 'eleves', 'tenantId', 'eleves.tenantId existe');
SELECT has_column('public', 'classes', 'tenantId', 'classes.tenantId existe');
SELECT has_column('public', 'notes', 'tenantId', 'notes.tenantId existe');

-- === Colonnes siteId (isolation par site) ===
SELECT has_column('public', 'users', 'siteId', 'users.siteId existe');
SELECT has_column('public', 'eleves', 'siteId', 'eleves.siteId existe');

-- === RLS activée (règle non-négociable #6 — fail-closed) ===
SELECT is((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'users' AND n.nspname = 'public'), true, 'RLS active sur users');
SELECT is((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'eleves' AND n.nspname = 'public'), true, 'RLS active sur eleves');
SELECT is((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'notes' AND n.nspname = 'public'), true, 'RLS active sur notes');

-- === Fonctions de contexte tenant ===
SELECT has_function('public', 'set_tenant_context', ARRAY['text'], 'set_tenant_context existe');

SELECT finish();
ROLLBACK;
