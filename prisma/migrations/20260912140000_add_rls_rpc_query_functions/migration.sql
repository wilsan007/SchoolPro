-- ============================================================
-- SchoolPro — Fonctions RPC RLS pour le client Supabase typé
-- ============================================================
-- PostgREST exécute chaque requête dans sa propre transaction.
-- set_config('app.tenant_id', ..., true) posé via un RPC séparé
-- ne survit pas à la fin de cette transaction : la requête suivante
-- ne voit plus le contexte.
--
-- Ces fonctions sont SECURITY DEFINER et posent le contexte RLS
-- (app.tenant_id, app.site_id…) PUIS sélectionnent les données
-- dans la MÊME transaction. Le contexte est posé avec set_config(…, true)
-- (portée transaction) : il est visible du SELECT qui suit dans la
-- même transaction, et automatiquement effacé au COMMIT.
--
-- SECURITY DEFINER est OBLIGATOIRE car plusieurs tables learnos_* ont
-- FORCE ROW LEVEL SECURITY activé : même le rôle postgres (propriétaire)
-- est soumis aux policies. La fonction s'exécute en tant que propriétaire
-- (postgres) mais pose le contexte avant le SELECT, donc la RLS filtre
-- correctement les lignes selon le tenant demandé.
--
-- Le tenant_id est passé en paramètre par l'application (depuis la session
-- authentifiée) — l'authentification reste vérifiée côté Next.js avant
-- l'appel RPC.

-- ============================================================
-- 1. eleves_with_rls : liste d'élèves filtrée par RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.eleves_with_rls(
  p_tenant_id TEXT,
  p_site_id TEXT DEFAULT '',
  p_site_ids TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id TEXT,
  nom TEXT,
  prenom TEXT,
  matricule TEXT,
  tenantId TEXT,
  siteId TEXT,
  classeId TEXT,
  statut TEXT,
  sexe TEXT,
  dateNaissance TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ctx AS (
    SELECT public.set_app_context(p_tenant_id, p_site_id, p_site_ids, FALSE) AS _
  )
  SELECT
    e.id, e.nom, e.prenom, e.matricule,
    e."tenantId", e."siteId", e."classeId",
    e.statut::TEXT, e.sexe::TEXT,
    e."dateNaissance"::TEXT
  FROM public.eleves e, ctx
  ORDER BY e.nom, e.prenom
  LIMIT p_limit OFFSET p_offset;
$$;

-- ============================================================
-- 2. eleve_by_id_with_rls : un élève par ID, filtré par RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.eleve_by_id_with_rls(
  p_tenant_id TEXT,
  p_eleve_id TEXT,
  p_site_id TEXT DEFAULT '',
  p_site_ids TEXT DEFAULT ''
)
RETURNS TABLE (
  id TEXT,
  nom TEXT,
  prenom TEXT,
  matricule TEXT,
  tenantId TEXT,
  siteId TEXT,
  classeId TEXT,
  statut TEXT,
  sexe TEXT,
  dateNaissance TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ctx AS (
    SELECT public.set_app_context(p_tenant_id, p_site_id, p_site_ids, FALSE) AS _
  )
  SELECT
    e.id, e.nom, e.prenom, e.matricule,
    e."tenantId", e."siteId", e."classeId",
    e.statut::TEXT, e.sexe::TEXT,
    e."dateNaissance"::TEXT
  FROM public.eleves e, ctx
  WHERE e.id = p_eleve_id;
$$;

-- ============================================================
-- 3. learnos_questions_with_rls : questions d'exercice filtrées par RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.learnos_questions_with_rls(
  p_tenant_id TEXT,
  p_competence_id TEXT DEFAULT NULL,
  p_langue TEXT DEFAULT 'fr',
  p_actif BOOLEAN DEFAULT TRUE,
  p_limit INTEGER DEFAULT 50,
  p_site_id TEXT DEFAULT '',
  p_site_ids TEXT DEFAULT ''
)
RETURNS TABLE (
  id TEXT,
  enonce TEXT,
  palier TEXT,
  actif BOOLEAN,
  langue TEXT,
  bareme INTEGER,
  competenceId TEXT,
  tenantId TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ctx AS (
    SELECT public.set_app_context(p_tenant_id, p_site_id, p_site_ids, FALSE) AS _
  )
  SELECT
    q.id, q.enonce, q.palier::TEXT, q.actif, q.langue,
    q.bareme, q."competenceId", q."tenantId"
  FROM public.learnos_questions q, ctx
  WHERE (p_competence_id IS NULL OR q."competenceId" = p_competence_id)
    AND q.langue = p_langue
    AND (p_actif IS NULL OR q.actif = p_actif)
  ORDER BY q."createdAt" DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 4. factures_with_rls : factures filtrées par RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.factures_with_rls(
  p_tenant_id TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_site_id TEXT DEFAULT '',
  p_site_ids TEXT DEFAULT ''
)
RETURNS TABLE (
  id TEXT,
  tenantId TEXT,
  siteId TEXT,
  numero TEXT,
  montant DECIMAL,
  statut TEXT,
  type TEXT,
  eleveId TEXT,
  anneeId TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ctx AS (
    SELECT public.set_app_context(p_tenant_id, p_site_id, p_site_ids, FALSE) AS _
  )
  SELECT
    f.id, f."tenantId", f."siteId", f.numero,
    f.montant, f.statut::TEXT, f.type::TEXT,
    f."eleveId", f."anneeId"
  FROM public.factures f, ctx
  ORDER BY f."createdAt" DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ============================================================
-- 5. check_rls_visibility : health check RLS
--    Pose le contexte et compte les élèves visibles.
--    Permet de vérifier que le filtrage RLS est actif.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_rls_visibility(
  p_tenant_id TEXT,
  p_site_id TEXT DEFAULT '',
  p_site_ids TEXT DEFAULT '',
  p_super_admin BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  tenant_id TEXT,
  eleve_count BIGINT,
  context_set BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH ctx AS (
    SELECT public.set_app_context(p_tenant_id, p_site_id, p_site_ids, p_super_admin) AS _
  )
  SELECT
    public.current_tenant_id(),
    COUNT(*)::BIGINT,
    public.rls_context_is_set()
  FROM public.eleves, ctx;
$$;
