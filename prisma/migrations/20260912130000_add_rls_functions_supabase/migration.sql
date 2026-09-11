-- ============================================================
-- EcolPro — Fonctions de contexte multi-tenant (RLS) pour Supabase
-- ============================================================
-- Version adaptée pour Supabase (rôle de connexion : postgres).
-- Les fonctions sont créées en SECURITY INVOKER (défaut) : écrire un
-- paramètre de session app.* ne demande aucun privilège particulier.
-- Les fonctions de lecture sont STABLE + PARALLEL SAFE pour permettre
-- l'inlining par le planificateur.

-- ============================================================
-- 1. Pose du contexte
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_site_context(p_site_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.site_id', p_site_id, true);
END;
$$ LANGUAGE plpgsql;

-- Point d'entrée unique utilisé par l'application : pose tout le contexte
-- en UN aller-retour.
CREATE OR REPLACE FUNCTION public.set_app_context(
  p_tenant_id   TEXT,
  p_site_id     TEXT,
  p_site_ids    TEXT,
  p_super_admin BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.tenant_id',   COALESCE(p_tenant_id, ''), true);
  PERFORM set_config('app.site_id',     COALESCE(p_site_id, ''),   true);
  PERFORM set_config('app.site_ids',    COALESCE(p_site_ids, ''),  true);
  PERFORM set_config('app.super_admin', CASE WHEN p_super_admin THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.context_set', 'on', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Lecture du contexte
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.current_site_id()
RETURNS TEXT
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.site_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.current_site_ids()
RETURNS TEXT[]
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN COALESCE(current_setting('app.site_ids', true), '') = '' THEN ARRAY[]::TEXT[]
    ELSE string_to_array(current_setting('app.site_ids', true), ',')
  END;
$$;

CREATE OR REPLACE FUNCTION public.rls_context_is_set()
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(current_setting('app.context_set', true), 'off') = 'on';
$$;

-- ============================================================
-- 3. Prédicats utilisés par les politiques
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(current_setting('app.super_admin', true), 'off') = 'on';
$$;

CREATE OR REPLACE FUNCTION public.tenant_matches(p_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.is_super_admin()
      OR (p_tenant_id IS NOT NULL AND p_tenant_id = public.current_tenant_id());
$$;

CREATE OR REPLACE FUNCTION public.site_matches(p_site_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.is_super_admin()
      OR p_site_id IS NULL
      OR p_site_id = ANY (public.current_site_ids());
$$;
