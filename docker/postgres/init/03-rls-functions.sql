-- ============================================================
-- EcolPro — Fonctions de contexte multi-tenant (RLS)
--
-- Ces fonctions injectent le tenant, le site courant et le périmètre de
-- sites autorisés dans des paramètres de session (`app.*`) que les
-- politiques RLS consultent ensuite.
--
-- PRINCIPE DIRECTEUR : ÉCHEC FERMÉ.
-- Si le contexte n'est pas posé, `current_tenant_id()` renvoie NULL ;
-- la comparaison `"tenantId" = NULL` vaut NULL, donc la ligne est
-- filtrée. Une requête qui « oublie » de poser le contexte ne voit
-- RIEN — elle ne voit surtout pas tout. C'est le comportement qu'on
-- veut : une panne visible plutôt qu'une fuite silencieuse.
--
-- Note de sécurité : la version historique du projet
-- (supabase/rls_setup.sql) les déclarait SECURITY DEFINER. C'est inutile
-- et risqué : écrire un paramètre de session dans un espace de noms
-- personnalisé (`app.*`) ne demande aucun privilège particulier. On reste
-- donc en SECURITY INVOKER (le défaut), ce qui supprime une voie
-- d'escalade sans rien perdre en fonctionnalité.
--
-- Note de performance : les fonctions de LECTURE sont en `LANGUAGE sql`,
-- `STABLE` et `PARALLEL SAFE`. Une politique RLS est évaluée pour chaque
-- ligne candidate : une fonction SQL simple est intégrée (inlinée) par le
-- planificateur, là où un bloc plpgsql impose un appel par ligne. Sur une
-- table de 100 000 notes, l'écart se compte en secondes.
--
-- Ce fichier est exécuté à l'initialisation de la base (initdb) ET
-- réapplicable tel quel sur une base existante : tout y est
-- `CREATE OR REPLACE`. C'est la source unique — il n'existe pas de copie
-- à maintenir en parallèle.
-- ============================================================

-- ============================================================
-- 1. Pose du contexte
-- ============================================================
-- Le troisième argument `true` de set_config limite la portée à la
-- transaction en cours : le contexte ne peut pas fuiter vers la requête
-- suivante lorsque PgBouncer recycle la connexion. C'est non négociable
-- en mode transaction — une portée « session » ferait hériter le tenant
-- d'un autre utilisateur à la requête suivante.

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
-- en UN aller-retour. Chaque requête applicative paie cet appel ; le
-- découper en quatre `SELECT` quadruplerait la latence réseau ajoutée.
--
--   p_tenant_id   tenant actif (NULL = aucun ⇒ plus rien n'est visible)
--   p_site_id     site sélectionné, pour information/écriture
--   p_site_ids    périmètre de sites autorisés, séparés par des virgules.
--                 Chaîne vide = aucun site ⇒ seules les lignes de niveau
--                 tenant (siteId NULL) restent visibles.
--   p_super_admin true uniquement pour un SUPER_ADMIN authentifié.
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
  -- Témoin explicite : distingue « contexte posé, tenant vide » de
  -- « contexte jamais posé ». L'audit s'en sert pour détecter un chemin
  -- de code qui aurait échappé au câblage.
  PERFORM set_config('app.context_set', 'on', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Lecture du contexte
-- ============================================================
-- NULLIF(..., '') : une chaîne vide doit se comporter comme NULL, sans
-- quoi un tenant non renseigné correspondrait à d'éventuelles lignes
-- dont le tenantId serait la chaîne vide.

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

-- Périmètre de sites autorisés, sous forme de tableau.
CREATE OR REPLACE FUNCTION public.current_site_ids()
RETURNS TEXT[]
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN COALESCE(current_setting('app.site_ids', true), '') = '' THEN ARRAY[]::TEXT[]
    ELSE string_to_array(current_setting('app.site_ids', true), ',')
  END;
$$;

-- Le contexte a-t-il été posé du tout ? Sert aux contrôles d'audit et aux
-- tests, jamais à assouplir une politique.
CREATE OR REPLACE FUNCTION public.rls_context_is_set()
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(current_setting('app.context_set', true), 'off') = 'on';
$$;

-- ============================================================
-- 3. Prédicats utilisés par les politiques
-- ============================================================

-- SUPER_ADMIN : traverse volontairement les tenants (support, migration,
-- tableau de bord global). Le drapeau n'est posé que par le code serveur
-- après vérification du rôle en session — jamais par une donnée client.
--
-- Ce n'est pas une faiblesse : quiconque pourrait poser ce drapeau
-- pourrait déjà lire les données directement. La RLS protège d'un OUBLI
-- de filtre applicatif, pas d'un attaquant qui exécuterait du SQL
-- arbitraire — contre lui, ce sont les rôles au moindre privilège et
-- l'absence d'injection qui jouent.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(current_setting('app.super_admin', true), 'off') = 'on';
$$;

-- Le tenant courant correspond-il à celui de la ligne ?
-- Un SUPER_ADMIN passe outre. Sinon, NULL des deux côtés reste faux.
CREATE OR REPLACE FUNCTION public.tenant_matches(p_tenant_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.is_super_admin()
      OR (p_tenant_id IS NOT NULL AND p_tenant_id = public.current_tenant_id());
$$;

-- Le site de la ligne est-il dans le périmètre de l'utilisateur ?
--
-- Trois cas, dans cet ordre :
--   1. SUPER_ADMIN            → vrai ;
--   2. ligne sans site (NULL) → vrai : c'est un enregistrement de niveau
--      tenant (tarifs, année scolaire, paramètres), visible de tous les
--      membres du tenant. L'isolation par tenant s'applique quand même,
--      portée par le prédicat de tenant de la même politique ;
--   3. sinon                  → le site doit figurer dans app.site_ids.
--
-- Périmètre vide ⇒ aucune ligne rattachée à un site n'est visible. C'est
-- volontaire : un utilisateur sans rattachement ne doit rien voir, pas
-- tout voir.
CREATE OR REPLACE FUNCTION public.site_matches(p_site_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.is_super_admin()
      OR p_site_id IS NULL
      OR p_site_id = ANY (public.current_site_ids());
$$;

-- ============================================================
-- 4. Propriété et droits
-- ============================================================
-- Les fonctions appartiennent au propriétaire du schéma, pas au
-- superutilisateur, pour rester cohérent avec le modèle de privilèges.
ALTER FUNCTION public.set_tenant_context(TEXT)                       OWNER TO ecolpro_owner;
ALTER FUNCTION public.set_site_context(TEXT)                         OWNER TO ecolpro_owner;
ALTER FUNCTION public.set_app_context(TEXT, TEXT, TEXT, BOOLEAN)     OWNER TO ecolpro_owner;
ALTER FUNCTION public.current_tenant_id()                            OWNER TO ecolpro_owner;
ALTER FUNCTION public.current_site_id()                              OWNER TO ecolpro_owner;
ALTER FUNCTION public.current_site_ids()                             OWNER TO ecolpro_owner;
ALTER FUNCTION public.rls_context_is_set()                           OWNER TO ecolpro_owner;
ALTER FUNCTION public.is_super_admin()                               OWNER TO ecolpro_owner;
ALTER FUNCTION public.tenant_matches(TEXT)                           OWNER TO ecolpro_owner;
ALTER FUNCTION public.site_matches(TEXT)                             OWNER TO ecolpro_owner;

GRANT EXECUTE ON FUNCTION public.set_tenant_context(TEXT)                   TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.set_site_context(TEXT)                     TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.set_app_context(TEXT, TEXT, TEXT, BOOLEAN) TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.current_tenant_id()                        TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.current_site_id()                          TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.current_site_ids()                         TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.rls_context_is_set()                       TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.is_super_admin()                           TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.tenant_matches(TEXT)                       TO ecolpro_app;
GRANT EXECUTE ON FUNCTION public.site_matches(TEXT)                         TO ecolpro_app;

-- Le rôle de diagnostic peut lire le contexte, pas le poser : un accès en
-- lecture seule ne doit pas pouvoir se faire passer pour un tenant.
GRANT EXECUTE ON FUNCTION public.current_tenant_id()  TO ecolpro_ro;
GRANT EXECUTE ON FUNCTION public.current_site_id()    TO ecolpro_ro;
GRANT EXECUTE ON FUNCTION public.rls_context_is_set() TO ecolpro_ro;
