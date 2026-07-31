-- ============================================================
-- Row Level Security (RLS) pour isolation multi-tenant
-- Sécurité au niveau base de données — bloque les fuites même
-- si le code oublie de filtrer par tenantId
-- ============================================================

-- Activer RLS sur toutes les tables avec tenantId
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = pg_tables.tablename
      AND column_name = 'tenantId'
    )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);

    -- Politique: toutes les opérations nécessitent que tenantId
    -- corresponde à app.current_tenant_id (set par l'app)
    EXECUTE format('
      DROP POLICY IF EXISTS tenant_isolation ON public.%I;
      CREATE POLICY tenant_isolation ON public.%I
      USING (tenantId = current_setting(''app.current_tenant_id'', true))
      WITH CHECK (tenantId = current_setting(''app.current_tenant_id'', true))
    ', tbl, tbl);
  END LOOP;
END $$;

-- Tables sans tenantId (users, tenants, user_tenants, etc.) — pas de RLS
-- SUPER_ADMIN a accès global
