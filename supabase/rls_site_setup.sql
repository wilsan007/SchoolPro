-- ============================================================
-- EcolPro — RLS Multi-Sites (Option 3)
-- Isolation des données par site au sein d'un même tenant
-- 
-- Principe :
--   - TENANT_ADMIN / SUPER_ADMIN → voient tous les sites (site_id = '')
--   - Autres rôles → ne voient que leur site (site_id = leur siteId)
--   - Données sans siteId (NULL) → visibles par tous les sites
--
-- Fonctionnement :
--   L'application set app.site_id dans la session PostgreSQL.
--   Si vide → pas de filtre (admin).
--   Si non vide → filtre par siteId = valeur OU siteId IS NULL.
-- ============================================================

-- 1. Fonction pour setter le site context
CREATE OR REPLACE FUNCTION public.set_site_context(p_site_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.site_id', p_site_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fonction pour récupérer le site context
CREATE OR REPLACE FUNCTION public.current_site_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.site_id', true);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Fonction utilitaire : true si le user est admin (pas de filtre site)
CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_site_id() = '' OR current_site_id() IS NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. Fonction utilitaire : true si le siteId correspond au contexte
CREATE OR REPLACE FUNCTION public.site_matches(p_site_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin: pas de filtre
  IF is_site_admin() THEN
    RETURN true;
  END IF;
  -- Données sans site: visibles par tous
  IF p_site_id IS NULL THEN
    RETURN true;
  END IF;
  -- Sinon: le siteId doit correspondre
  RETURN p_site_id = current_site_id();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 5. RLS Policies — Tables avec siteId direct
-- ============================================================

-- ELEVES
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eleves_site_isolation" ON public.eleves;
CREATE POLICY "eleves_site_isolation" ON public.eleves
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- CLASSES (a déjà siteId)
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classes_site_isolation" ON public.classes;
CREATE POLICY "classes_site_isolation" ON public.classes
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- SALLES (a déjà siteId)
ALTER TABLE public.salles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "salles_site_isolation" ON public.salles;
CREATE POLICY "salles_site_isolation" ON public.salles
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- FACTURES (a déjà siteId)
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "factures_site_isolation" ON public.factures;
CREATE POLICY "factures_site_isolation" ON public.factures
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- EXAMENS
ALTER TABLE public.examens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "examens_site_isolation" ON public.examens;
CREATE POLICY "examens_site_isolation" ON public.examens
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- EVENEMENTS
ALTER TABLE public.evenements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evenements_site_isolation" ON public.evenements;
CREATE POLICY "evenements_site_isolation" ON public.evenements
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- NOTIFICATIONS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_site_isolation" ON public.notifications;
CREATE POLICY "notifications_site_isolation" ON public.notifications
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- CANDIDATURES
ALTER TABLE public.candidatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "candidatures_site_isolation" ON public.candidatures;
CREATE POLICY "candidatures_site_isolation" ON public.candidatures
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- INVENTAIRE
ALTER TABLE public.inventaire ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventaire_site_isolation" ON public.inventaire;
CREATE POLICY "inventaire_site_isolation" ON public.inventaire
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- COURS
ALTER TABLE public.cours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cours_site_isolation" ON public.cours;
CREATE POLICY "cours_site_isolation" ON public.cours
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- ALUMNI
ALTER TABLE public.alumni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alumni_site_isolation" ON public.alumni;
CREATE POLICY "alumni_site_isolation" ON public.alumni
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND site_matches("siteId")
  );

-- USERS (a déjà siteId)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_site_isolation" ON public.users;
CREATE POLICY "users_site_isolation" ON public.users
  FOR ALL USING (
    ("tenantId" = current_tenant_id() OR "tenantId" IS NULL)
    AND site_matches("siteId")
  );

-- ============================================================
-- 6. RLS Policies — Tables enfants (filtrage via parent)
-- ============================================================

-- ABSENCES → via eleve.siteId
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "absences_site_isolation" ON public.absences;
CREATE POLICY "absences_site_isolation" ON public.absences
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.eleves e
        WHERE e.id = absences."eleveId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- NOTES → via eleve.siteId
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_site_isolation" ON public.notes;
CREATE POLICY "notes_site_isolation" ON public.notes
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.eleves e
        WHERE e.id = notes."eleveId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- EVALUATIONS → via classe.siteId
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evaluations_site_isolation" ON public.evaluations;
CREATE POLICY "evaluations_site_isolation" ON public.evaluations
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = evaluations."classeId"
        AND (c."siteId" = current_site_id() OR c."siteId" IS NULL)
      )
    )
  );

-- EMPLOIS_TEMPS → via classe.siteId
ALTER TABLE public.emplois_temps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "emplois_temps_site_isolation" ON public.emplois_temps;
CREATE POLICY "emplois_temps_site_isolation" ON public.emplois_temps
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = emplois_temps."classeId"
        AND (c."siteId" = current_site_id() OR c."siteId" IS NULL)
      )
    )
  );

-- BULLETINS → via eleve.siteId
ALTER TABLE public.bulletins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bulletins_site_isolation" ON public.bulletins;
CREATE POLICY "bulletins_site_isolation" ON public.bulletins
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.eleves e
        WHERE e.id = bulletins."eleveId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- BULLETIN_MATIERES → via bulletin → eleve.siteId
ALTER TABLE public.bulletin_matieres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bulletin_matieres_site_isolation" ON public.bulletin_matieres;
CREATE POLICY "bulletin_matieres_site_isolation" ON public.bulletin_matieres
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.bulletins b
        JOIN public.eleves e ON e.id = b."eleveId"
        WHERE b.id = bulletin_matieres."bulletinId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- INCIDENTS → via eleve.siteId
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incidents_site_isolation" ON public.incidents;
CREATE POLICY "incidents_site_isolation" ON public.incidents
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.eleves e
        WHERE e.id = incidents."eleveId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- SANCTIONS → via incident → eleve.siteId
ALTER TABLE public.sanctions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sanctions_site_isolation" ON public.sanctions;
CREATE POLICY "sanctions_site_isolation" ON public.sanctions
  FOR ALL USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM public.incidents i
      JOIN public.eleves e ON e.id = i."eleveId"
      WHERE i.id = sanctions."incidentId"
      AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
    )
  );

-- DOCUMENTS → via eleve.siteId
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documents_site_isolation" ON public.documents;
CREATE POLICY "documents_site_isolation" ON public.documents
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR "eleveId" IS NULL
      OR EXISTS (
        SELECT 1 FROM public.eleves e
        WHERE e.id = documents."eleveId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- SESSIONS_EXAMEN → via examen.siteId
ALTER TABLE public.sessions_examen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_examen_site_isolation" ON public.sessions_examen;
CREATE POLICY "sessions_examen_site_isolation" ON public.sessions_examen
  FOR ALL USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM public.examens ex
      WHERE ex.id = sessions_examen."examId"
      AND (ex."siteId" = current_site_id() OR ex."siteId" IS NULL)
    )
  );

-- PAIEMENTS → via facture.siteId
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "paiements_site_isolation" ON public.paiements;
CREATE POLICY "paiements_site_isolation" ON public.paiements
  FOR ALL USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM public.factures f
      WHERE f.id = paiements."factureId"
      AND (f."siteId" = current_site_id() OR f."siteId" IS NULL)
    )
  );

-- PARCOURS_SCOLAIRES → via eleve.siteId
ALTER TABLE public.parcours_scolaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parcours_site_isolation" ON public.parcours_scolaires;
CREATE POLICY "parcours_site_isolation" ON public.parcours_scolaires
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.eleves e
        WHERE e.id = parcours_scolaires."eleveId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- DISPENSES_MATIERE → via eleve.siteId
ALTER TABLE public.dispenses_matiere ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispenses_site_isolation" ON public.dispenses_matiere;
CREATE POLICY "dispenses_site_isolation" ON public.dispenses_matiere
  FOR ALL USING (
    "tenantId" = current_tenant_id()
    AND (
      is_site_admin()
      OR EXISTS (
        SELECT 1 FROM public.eleves e
        WHERE e.id = dispenses_matiere."eleveId"
        AND (e."siteId" = current_site_id() OR e."siteId" IS NULL)
      )
    )
  );

-- CONTENUS_COURS → via cours.siteId
ALTER TABLE public.contenus_cours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contenus_cours_site_isolation" ON public.contenus_cours;
CREATE POLICY "contenus_cours_site_isolation" ON public.contenus_cours
  FOR ALL USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM public.cours c
      WHERE c.id = contenus_cours."coursId"
      AND (c."siteId" = current_site_id() OR c."siteId" IS NULL)
    )
  );

-- PROGRESSIONS_ELEVES → via cours.siteId
ALTER TABLE public.progressions_eleves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "progressions_site_isolation" ON public.progressions_eleves;
CREATE POLICY "progressions_site_isolation" ON public.progressions_eleves
  FOR ALL USING (
    is_site_admin()
    OR EXISTS (
      SELECT 1 FROM public.cours c
      WHERE c.id = progressions_eleves."coursId"
      AND (c."siteId" = current_site_id() OR c."siteId" IS NULL)
    )
  );

-- ============================================================
-- Note: La service_role key bypass automatiquement le RLS.
-- Les policies de site s'ajoutent aux policies de tenant existantes.
-- L'application doit appeler set_site_context() après set_tenant_context().
-- ============================================================
