-- ============================================================
-- RLS : rendre le filtrage par site EFFECTIF en base
-- ============================================================
-- Constat (2026-10-05) : sur les tables portant `siteId`, la politique de site
-- et la politique de tenant étaient toutes deux PERMISSIVES. PostgreSQL les
-- combine par OU : celle du tenant suffisait à tout autoriser, et le site ne
-- filtrait rien (132 classes visibles pour une session bornée à un site qui en
-- compte 66). Onze tables n'avaient aucune politique de site.
--
-- Après cette migration :
--   * la règle de site est RESTRICTIVE (combinée par ET avec celle du tenant) ;
--   * le périmètre est explicite — `app.site_scope` vaut :
--       'all'   direction générale, familles (périmètre personnel), mono-site ;
--       'sites' personnel : lignes de ses sites + lignes sans site (partagées) ;
--       'none'  personnel sans aucun rattachement : aucune ligne rattachée ;
--       ''      contexte posé par une version de l'application antérieure à
--               cette migration : aucune restriction de site (comportement
--               effectif d'avant, pour ne rien casser au déploiement) ;
--   * les tables rattachées à un site par leur élève, classe, cours, facture
--     ou examen suivent la même règle.
--
-- Hors périmètre, volontairement : `users` (son `siteId` est le site
-- SÉLECTIONNÉ par l'utilisateur, pas un périmètre de données — le filtrer
-- masquerait des comptes référencés par des relations obligatoires),
-- `user_sites` et `enseignant_sites` (tables de rattachement elles-mêmes).
--
-- Idempotent. Application (sauvegarde des politiques actuelles incluse) :
--   node --env-file=.env --env-file=.env.local scripts/appliquer-migration-rls-site-scope.cjs --apply

-- 1. Contexte ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_site_scope()
RETURNS TEXT
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(current_setting('app.site_scope', true), '');
$$;

-- Signature historique : conservée, elle pose un périmètre « non précisé ».
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
  PERFORM set_config('app.site_scope',  '', true);
  PERFORM set_config('app.context_set', 'on', true);
END;
$$ LANGUAGE plpgsql;

-- Nouvelle signature : le périmètre de sites est explicite. Une valeur
-- inconnue est traitée comme 'none' (échec fermé).
CREATE OR REPLACE FUNCTION public.set_app_context(
  p_tenant_id   TEXT,
  p_site_id     TEXT,
  p_site_ids    TEXT,
  p_super_admin BOOLEAN,
  p_site_scope  TEXT
)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.tenant_id',   COALESCE(p_tenant_id, ''), true);
  PERFORM set_config('app.site_id',     COALESCE(p_site_id, ''),   true);
  PERFORM set_config('app.site_ids',    COALESCE(p_site_ids, ''),  true);
  PERFORM set_config('app.super_admin', CASE WHEN p_super_admin THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.site_scope',
    CASE WHEN p_site_scope IN ('all', 'sites') THEN p_site_scope ELSE 'none' END, true);
  PERFORM set_config('app.context_set', 'on', true);
END;
$$ LANGUAGE plpgsql;

-- Vrai quand aucune restriction de site ne s'applique à la session.
CREATE OR REPLACE FUNCTION public.site_scope_unrestricted()
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.is_super_admin() OR public.current_site_scope() IN ('', 'all');
$$;

CREATE OR REPLACE FUNCTION public.site_matches(p_site_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT public.site_scope_unrestricted()
      OR (public.current_site_scope() = 'sites'
          AND (p_site_id IS NULL OR p_site_id = ANY (public.current_site_ids())));
$$;

-- 2. Tables portant `siteId` --------------------------------------------------
DO $$
DECLARE
  t RECORD;
  p RECORD;
  v_permissives INTEGER;
BEGIN
  FOR t IN
    SELECT k.relname AS nom,
           EXISTS (SELECT 1 FROM information_schema.columns x
                    WHERE x.table_schema = 'public' AND x.table_name = k.relname AND x.column_name = 'tenantId') AS a_tenant
      FROM pg_class k
      JOIN information_schema.columns c
        ON c.table_schema = 'public' AND c.table_name = k.relname AND c.column_name = 'siteId'
     WHERE k.relnamespace = 'public'::regnamespace AND k.relkind = 'r' AND k.relrowsecurity
       AND k.relname NOT IN ('users', 'user_sites', 'enseignant_sites')
  LOOP
    -- Les anciennes politiques de site, permissives donc sans effet.
    FOR p IN SELECT policyname FROM pg_policies
              WHERE schemaname = 'public' AND tablename = t.nom
                AND permissive = 'PERMISSIVE' AND qual ILIKE '%site_matches%'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t.nom);
    END LOOP;

    -- Une politique restrictive ne fait que retrancher : il faut une politique
    -- permissive de tenant pour accorder. Cinq tables n'avaient que l'ancienne
    -- politique combinée (tenant ET site) : sa moitié « tenant » est recréée.
    SELECT count(*) INTO v_permissives FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t.nom AND permissive = 'PERMISSIVE';
    IF v_permissives = 0 AND t.a_tenant THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING ("tenantId" = public.current_tenant_id())',
                     t.nom || '_tenant_isolation', t.nom);
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.nom || '_site_scope', t.nom);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL USING (public.site_matches("siteId"))',
                   t.nom || '_site_scope', t.nom);
  END LOOP;
END $$;

-- 3. Tables rattachées à un site par une relation ------------------------------
-- (table, ancienne politique, condition « le parent est dans mon périmètre »,
--  politique permissive de repli si la table n'en a aucune autre)
DO $$
DECLARE
  r RECORD;
  v_permissives INTEGER;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('absences',            'absences_site_isolation',
       'EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = absences."eleveId" AND public.site_matches(e."siteId"))', NULL),
      ('bulletins',           'bulletins_site_isolation',
       'EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = bulletins."eleveId" AND public.site_matches(e."siteId"))', NULL),
      ('bulletin_matieres',   'bulletin_matieres_site_isolation',
       'EXISTS (SELECT 1 FROM public.bulletins b JOIN public.eleves e ON e.id = b."eleveId" WHERE b.id = bulletin_matieres."bulletinId" AND public.site_matches(e."siteId"))', NULL),
      ('dispenses_matiere',   'dispenses_site_isolation',
       'EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = dispenses_matiere."eleveId" AND public.site_matches(e."siteId"))', NULL),
      ('documents',           'documents_site_isolation',
       'documents."eleveId" IS NULL OR EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = documents."eleveId" AND public.site_matches(e."siteId"))', NULL),
      ('emplois_temps',       'emplois_temps_site_isolation',
       'EXISTS (SELECT 1 FROM public.classes c WHERE c.id = emplois_temps."classeId" AND public.site_matches(c."siteId"))', NULL),
      ('evaluations',         'evaluations_site_isolation',
       'EXISTS (SELECT 1 FROM public.classes c WHERE c.id = evaluations."classeId" AND public.site_matches(c."siteId"))', NULL),
      ('incidents',           'incidents_site_isolation',
       'EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = incidents."eleveId" AND public.site_matches(e."siteId"))', NULL),
      ('notes',               'notes_site_isolation',
       'EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = notes."eleveId" AND public.site_matches(e."siteId"))', NULL),
      ('parcours_scolaires',  'parcours_site_isolation',
       'EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = parcours_scolaires."eleveId" AND public.site_matches(e."siteId"))', NULL),
      ('contenus_cours',      'contenus_cours_site_isolation',
       'EXISTS (SELECT 1 FROM public.cours c WHERE c.id = contenus_cours."coursId" AND public.site_matches(c."siteId"))',
       'EXISTS (SELECT 1 FROM public.cours c WHERE c.id = contenus_cours."coursId")'),
      ('progressions_eleves', 'progressions_site_isolation',
       'EXISTS (SELECT 1 FROM public.cours c WHERE c.id = progressions_eleves."coursId" AND public.site_matches(c."siteId"))',
       'EXISTS (SELECT 1 FROM public.cours c WHERE c.id = progressions_eleves."coursId")'),
      ('paiements',           'paiements_site_isolation',
       'EXISTS (SELECT 1 FROM public.factures f WHERE f.id = paiements."factureId" AND public.site_matches(f."siteId"))',
       'EXISTS (SELECT 1 FROM public.factures f WHERE f.id = paiements."factureId")'),
      ('sanctions',           'sanctions_site_isolation',
       'EXISTS (SELECT 1 FROM public.incidents i JOIN public.eleves e ON e.id = i."eleveId" WHERE i.id = sanctions."incidentId" AND public.site_matches(e."siteId"))',
       'EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = sanctions."incidentId")'),
      ('sessions_examen',     'sessions_examen_site_isolation',
       'EXISTS (SELECT 1 FROM public.examens ex WHERE ex.id = sessions_examen."examId" AND public.site_matches(ex."siteId"))',
       'EXISTS (SELECT 1 FROM public.examens ex WHERE ex.id = sessions_examen."examId")')
    ) AS v(nom, ancienne, dans_perimetre, repli)
  LOOP
    CONTINUE WHEN to_regclass('public.' || r.nom) IS NULL;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.ancienne, r.nom);

    SELECT count(*) INTO v_permissives FROM pg_policies
     WHERE schemaname = 'public' AND tablename = r.nom AND permissive = 'PERMISSIVE';
    IF v_permissives = 0 THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns x
                  WHERE x.table_schema = 'public' AND x.table_name = r.nom AND x.column_name = 'tenantId') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING ("tenantId" = public.current_tenant_id())',
                       r.nom || '_tenant_isolation', r.nom);
      ELSE
        -- Pas de `tenantId` propre : l'isolation par tenant est celle du parent
        -- (lu sous ses propres politiques).
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (%s)', r.nom || '_parent_isolation', r.nom, r.repli);
      END IF;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.nom || '_site_scope', r.nom);
    -- `site_scope_unrestricted()` en tête : sans restriction de site, la
    -- sous-requête n'est pas évaluée.
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL USING (public.site_scope_unrestricted() OR %s)',
                   r.nom || '_site_scope', r.nom, r.dans_perimetre);
  END LOOP;
END $$;

-- 4. Une ligne n'est visible que si ses parents obligatoires le sont -----------
-- Audit du 2026-10-06 (scripts/auditer-relations-inter-sites.ts) : 11 relations
-- obligatoires pointaient vers une ligne masquée — 3 492 relances dont la
-- facture est sur l'autre site, 1 848 historiques de classe, 1 037 affectations
-- vers une classe de l'autre site… Deux conséquences sous filtrage effectif :
--   * ces lignes « enfants » restaient lisibles (fuite) ;
--   * les charger avec leur parent faisait échouer toute la requête Prisma
--     (relation obligatoire nulle).
-- Règle générique, pour toute clé étrangère NOT NULL vers une table filtrée par
-- site : l'enfant suit la visibilité de son parent. La sous-requête est lue
-- sous les politiques du parent ; elle n'est pas évaluée sans restriction de
-- site (`site_scope_unrestricted()` en tête).
DO $$
DECLARE
  r RECORD;
  v_nom TEXT;
BEGIN
  -- Rejouable : on retire d'abord les politiques de ce type déjà posées.
  FOR r IN SELECT tablename, policyname FROM pg_policies
            WHERE schemaname = 'public' AND policyname LIKE '%\_parent\_scope' ESCAPE '\'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;

  FOR r IN
    SELECT enfant.relname AS enfant, col.attname AS fk, parent.relname AS parent
      FROM pg_constraint k
      JOIN pg_class enfant ON enfant.oid = k.conrelid
      JOIN pg_class parent ON parent.oid = k.confrelid
      JOIN pg_attribute col ON col.attrelid = k.conrelid AND col.attnum = k.conkey[1]
     WHERE k.contype = 'f'
       AND k.connamespace = 'public'::regnamespace
       AND array_length(k.conkey, 1) = 1
       AND col.attnotnull
       AND enfant.relrowsecurity
       AND enfant.oid <> parent.oid
       AND EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = parent.relname AND p.permissive = 'RESTRICTIVE')
       -- Déjà couvert par la section 3 (même parent, même clé).
       AND NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = enfant.relname
                          AND p.policyname = enfant.relname || '_site_scope'
                          AND p.qual ILIKE '%' || parent.relname || ' %'
                          AND p.qual ILIKE '%"' || col.attname || '"%')
     ORDER BY 1, 2
  LOOP
    v_nom := left(r.enfant || '_' || r.fk, 50) || '_parent_scope';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL USING (public.site_scope_unrestricted() OR EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I))',
      v_nom, r.enfant, r.parent, r.enfant, r.fk);
  END LOOP;
END $$;
