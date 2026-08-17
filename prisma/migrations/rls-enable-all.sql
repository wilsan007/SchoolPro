-- ============================================================================
-- RLS ENABLEMENT — SchoolPro / EcolPro
-- Active Row Level Security sur les 61 tables qui ne l'avaient pas.
-- Pattern: isolation par tenant + site (cohérent avec les 50 tables existantes).
-- Les fonctions current_tenant_id(), current_site_id(), site_matches() existent déjà.
-- ============================================================================

BEGIN;

-- ============================================================================
-- CATÉGORIE 1: Tables avec tenantId + siteId (22 tables)
-- Pattern standard: tenant_isolation (PERMISSIVE) + site_isolation (PERMISSIVE)
-- ============================================================================

-- budgets
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY budgets_tenant_isolation ON public.budgets FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY budgets_site_isolation ON public.budgets FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- depenses
ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY depenses_tenant_isolation ON public.depenses FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY depenses_site_isolation ON public.depenses FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- devoirs
ALTER TABLE public.devoirs ENABLE ROW LEVEL SECURITY;
CREATE POLICY devoirs_tenant_isolation ON public.devoirs FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY devoirs_site_isolation ON public.devoirs FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_ai_decision_logs
ALTER TABLE public.learnos_ai_decision_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_ai_decision_logs_tenant ON public.learnos_ai_decision_logs FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_ai_decision_logs_site ON public.learnos_ai_decision_logs FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_calibration_seuils
ALTER TABLE public.learnos_calibration_seuils ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_calibration_seuils_tenant ON public.learnos_calibration_seuils FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_calibration_seuils_site ON public.learnos_calibration_seuils FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_chapitres
ALTER TABLE public.learnos_chapitres ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_chapitres_tenant ON public.learnos_chapitres FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_chapitres_site ON public.learnos_chapitres FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_competences
ALTER TABLE public.learnos_competences ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_competences_tenant ON public.learnos_competences FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_competences_site ON public.learnos_competences FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_evaluation_competences
ALTER TABLE public.learnos_evaluation_competences ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_eval_comp_tenant ON public.learnos_evaluation_competences FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_eval_comp_site ON public.learnos_evaluation_competences FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_events
ALTER TABLE public.learnos_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_events_tenant ON public.learnos_events FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_events_site ON public.learnos_events FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_journal_apprentissage
ALTER TABLE public.learnos_journal_apprentissage ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_journal_app_tenant ON public.learnos_journal_apprentissage FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_journal_app_site ON public.learnos_journal_apprentissage FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_kpi_snapshots
ALTER TABLE public.learnos_kpi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_kpi_snapshots_tenant ON public.learnos_kpi_snapshots FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_kpi_snapshots_site ON public.learnos_kpi_snapshots FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_patterns_pedago
ALTER TABLE public.learnos_patterns_pedago ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_patterns_pedago_tenant ON public.learnos_patterns_pedago FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_patterns_pedago_site ON public.learnos_patterns_pedago FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_planification_chapitres
ALTER TABLE public.learnos_planification_chapitres ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_plan_chap_tenant ON public.learnos_planification_chapitres FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_plan_chap_site ON public.learnos_planification_chapitres FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_planification_competences
ALTER TABLE public.learnos_planification_competences ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_plan_comp_tenant ON public.learnos_planification_competences FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_plan_comp_site ON public.learnos_planification_competences FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_plans_lecon
ALTER TABLE public.learnos_plans_lecon ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_plans_lecon_tenant ON public.learnos_plans_lecon FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_plans_lecon_site ON public.learnos_plans_lecon FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_questions
ALTER TABLE public.learnos_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_questions_tenant ON public.learnos_questions FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_questions_site ON public.learnos_questions FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_rubriques_evaluation
ALTER TABLE public.learnos_rubriques_evaluation ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_rubriques_eval_tenant ON public.learnos_rubriques_evaluation FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_rubriques_eval_site ON public.learnos_rubriques_evaluation FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_seuils_recommandation
ALTER TABLE public.learnos_seuils_recommandation ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_seuils_reco_tenant ON public.learnos_seuils_recommandation FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_seuils_reco_site ON public.learnos_seuils_recommandation FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- remplacements_cours
ALTER TABLE public.remplacements_cours ENABLE ROW LEVEL SECURITY;
CREATE POLICY remplacements_tenant ON public.remplacements_cours FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY remplacements_site ON public.remplacements_cours FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- structures
ALTER TABLE public.structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY structures_tenant ON public.structures FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY structures_site ON public.structures FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- taches
ALTER TABLE public.taches ENABLE ROW LEVEL SECURITY;
CREATE POLICY taches_tenant ON public.taches FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY taches_site ON public.taches FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- tarifs_niveau
ALTER TABLE public.tarifs_niveau ENABLE ROW LEVEL SECURITY;
CREATE POLICY tarifs_niveau_tenant ON public.tarifs_niveau FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY tarifs_niveau_site ON public.tarifs_niveau FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- ============================================================================
-- CATÉGORIE 2: Tables avec tenantId + siteId + eleveId (13 tables)
-- Même pattern que catégorie 1 (le filtrage par eleveId est géré par l'app)
-- ============================================================================

-- entretiens_conseiller
ALTER TABLE public.entretiens_conseiller ENABLE ROW LEVEL SECURITY;
CREATE POLICY entretiens_conseiller_tenant ON public.entretiens_conseiller FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY entretiens_conseiller_site ON public.entretiens_conseiller FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- fiches_sanitaires
ALTER TABLE public.fiches_sanitaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiches_sanitaires_tenant ON public.fiches_sanitaires FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY fiches_sanitaires_site ON public.fiches_sanitaires FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_alertes_parent
ALTER TABLE public.learnos_alertes_parent ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_alertes_parent_tenant ON public.learnos_alertes_parent FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_alertes_parent_site ON public.learnos_alertes_parent FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_echanges_parent
ALTER TABLE public.learnos_echanges_parent ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_echanges_parent_tenant ON public.learnos_echanges_parent FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_echanges_parent_site ON public.learnos_echanges_parent FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_feuilles_exercices
ALTER TABLE public.learnos_feuilles_exercices ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_feuilles_ex_tenant ON public.learnos_feuilles_exercices FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_feuilles_ex_site ON public.learnos_feuilles_exercices FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_learning_evidences
ALTER TABLE public.learnos_learning_evidences ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_learning_evidences_tenant ON public.learnos_learning_evidences FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_learning_evidences_site ON public.learnos_learning_evidences FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_plans_progression
ALTER TABLE public.learnos_plans_progression ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_plans_prog_tenant ON public.learnos_plans_progression FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_plans_prog_site ON public.learnos_plans_progression FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_predictions
ALTER TABLE public.learnos_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_predictions_tenant ON public.learnos_predictions FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_predictions_site ON public.learnos_predictions FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_recommandations
ALTER TABLE public.learnos_recommandations ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_recommandations_tenant ON public.learnos_recommandations FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_recommandations_site ON public.learnos_recommandations FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_student_interventions
ALTER TABLE public.learnos_student_interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_student_int_tenant ON public.learnos_student_interventions FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_student_int_site ON public.learnos_student_interventions FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- learnos_student_learning_profiles
ALTER TABLE public.learnos_student_learning_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_student_lp_tenant ON public.learnos_student_learning_profiles FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY learnos_student_lp_site ON public.learnos_student_learning_profiles FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- passages_infirmerie
ALTER TABLE public.passages_infirmerie ENABLE ROW LEVEL SECURITY;
CREATE POLICY passages_infirmerie_tenant ON public.passages_infirmerie FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY passages_infirmerie_site ON public.passages_infirmerie FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));

-- ============================================================================
-- CATÉGORIE 3: Tables avec tenantId uniquement (13 tables)
-- Pattern: tenant_isolation seulement
-- ============================================================================

-- audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_tenant ON public.audit_logs FOR ALL USING ("tenantId" = current_tenant_id());

-- conseils
ALTER TABLE public.conseils ENABLE ROW LEVEL SECURITY;
CREATE POLICY conseils_tenant ON public.conseils FOR ALL USING ("tenantId" = current_tenant_id());

-- demandes_lien_parent (TE: tenantId + eleveId, pas de siteId)
ALTER TABLE public.demandes_lien_parent ENABLE ROW LEVEL SECURITY;
CREATE POLICY demandes_lien_parent_tenant ON public.demandes_lien_parent FOR ALL USING ("tenantId" = current_tenant_id());

-- exclusions_eleve (TE: tenantId + eleveId, pas de siteId)
ALTER TABLE public.exclusions_eleve ENABLE ROW LEVEL SECURITY;
CREATE POLICY exclusions_eleve_tenant ON public.exclusions_eleve FOR ALL USING ("tenantId" = current_tenant_id());

-- historique_classes (TE: tenantId + eleveId, pas de siteId)
ALTER TABLE public.historique_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY historique_classes_tenant ON public.historique_classes FOR ALL USING ("tenantId" = current_tenant_id());

-- learnos_preferences_parent
ALTER TABLE public.learnos_preferences_parent ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_preferences_parent_tenant ON public.learnos_preferences_parent FOR ALL USING ("tenantId" = current_tenant_id());

-- mentorats
ALTER TABLE public.mentorats ENABLE ROW LEVEL SECURITY;
CREATE POLICY mentorats_tenant ON public.mentorats FOR ALL USING ("tenantId" = current_tenant_id());

-- module_activations
ALTER TABLE public.module_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY module_activations_tenant ON public.module_activations FOR ALL USING ("tenantId" = current_tenant_id());

-- relances
ALTER TABLE public.relances ENABLE ROW LEVEL SECURITY;
CREATE POLICY relances_tenant ON public.relances FOR ALL USING ("tenantId" = current_tenant_id());

-- resolutions
ALTER TABLE public.resolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY resolutions_tenant ON public.resolutions FOR ALL USING ("tenantId" = current_tenant_id());

-- sync_configs
ALTER TABLE public.sync_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_configs_tenant ON public.sync_configs FOR ALL USING ("tenantId" = current_tenant_id());

-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_tenant ON public.user_roles FOR ALL USING ("tenantId" = current_tenant_id());

-- user_tenants
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_tenants_tenant ON public.user_tenants FOR ALL USING ("tenantId" = current_tenant_id());

-- ============================================================================
-- CATÉGORIE 4: Table avec siteId uniquement (user_sites)
-- Filtre via la table sites qui a tenantId
-- ============================================================================

ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_sites_tenant ON public.user_sites FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = user_sites."siteId"
      AND s."tenantId" = current_tenant_id()
  )
);

-- ============================================================================
-- CATÉGORIE 5: Tables enfant sans tenantId — filtrage via parent (10 tables)
-- Pattern: EXISTS subquery vers la table parente qui a tenantId
-- ============================================================================

-- echeanciers → factures
ALTER TABLE public.echeanciers ENABLE ROW LEVEL SECURITY;
CREATE POLICY echeanciers_tenant ON public.echeanciers FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.factures f
    WHERE f.id = echeanciers."factureId"
      AND f."tenantId" = current_tenant_id()
  )
);

-- echeances_paiement → echeanciers → factures (ou directement factures)
ALTER TABLE public.echeances_paiement ENABLE ROW LEVEL SECURITY;
CREATE POLICY echeances_paiement_tenant ON public.echeances_paiement FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.factures f
    WHERE f.id = echeances_paiement."factureId"
      AND f."tenantId" = current_tenant_id()
  )
);

-- evenements_calendaires → annees_scolaires
ALTER TABLE public.evenements_calendaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY evenements_calendaires_tenant ON public.evenements_calendaires FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.annees_scolaires a
    WHERE a.id = evenements_calendaires."anneeId"
      AND a."tenantId" = current_tenant_id()
  )
);

-- learnos_etapes_plan → learnos_plans_progression
ALTER TABLE public.learnos_etapes_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_etapes_plan_tenant ON public.learnos_etapes_plan FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.learnos_plans_progression p
    WHERE p.id = learnos_etapes_plan."planId"
      AND p."tenantId" = current_tenant_id()
  )
);

-- learnos_exercices_assignes → learnos_feuilles_exercices
ALTER TABLE public.learnos_exercices_assignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_exercices_assignes_tenant ON public.learnos_exercices_assignes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.learnos_feuilles_exercices f
    WHERE f.id = learnos_exercices_assignes."feuilleId"
      AND f."tenantId" = current_tenant_id()
  )
);

-- learnos_exercices_reponses → learnos_exercices_assignes → learnos_feuilles_exercices
ALTER TABLE public.learnos_exercices_reponses ENABLE ROW LEVEL SECURITY;
CREATE POLICY learnos_exercices_reponses_tenant ON public.learnos_exercices_reponses FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.learnos_exercices_assignes ea
    JOIN public.learnos_feuilles_exercices fe ON fe.id = ea."feuilleId"
    WHERE ea.id = learnos_exercices_reponses."exerciceAssigneId"
      AND fe."tenantId" = current_tenant_id()
  )
);

-- membres_conseil → conseils
ALTER TABLE public.membres_conseil ENABLE ROW LEVEL SECURITY;
CREATE POLICY membres_conseil_tenant ON public.membres_conseil FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.conseils c
    WHERE c.id = membres_conseil."conseilId"
      AND c."tenantId" = current_tenant_id()
  )
);

-- objectifs_mentorat → mentorats
ALTER TABLE public.objectifs_mentorat ENABLE ROW LEVEL SECURITY;
CREATE POLICY objectifs_mentorat_tenant ON public.objectifs_mentorat FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.mentorats m
    WHERE m.id = objectifs_mentorat."mentoratId"
      AND m."tenantId" = current_tenant_id()
  )
);

-- reunions → conseils
ALTER TABLE public.reunions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reunions_tenant ON public.reunions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.conseils c
    WHERE c.id = reunions."conseilId"
      AND c."tenantId" = current_tenant_id()
  )
);

-- seances_mentorat → mentorats
ALTER TABLE public.seances_mentorat ENABLE ROW LEVEL SECURITY;
CREATE POLICY seances_mentorat_tenant ON public.seances_mentorat FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.mentorats m
    WHERE m.id = seances_mentorat."mentoratId"
      AND m."tenantId" = current_tenant_id()
  )
);

-- ============================================================================
-- CATÉGORIE 6: Tables globales sans tenant (2 tables)
-- modules: catalogue global — lecture seule pour tous (pas d'écriture via API REST)
-- learnos_ai_cache: cache global — AUCUN accès via API REST anon/authenticated
-- ============================================================================

-- modules: catalogue global en lecture seule
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY modules_read_all ON public.modules FOR SELECT USING (true);
-- Pas de policy INSERT/UPDATE/DELETE = seul service_role peut écrire

-- learnos_ai_cache: deny all pour anon/authenticated (service_role bypass RLS)
ALTER TABLE public.learnos_ai_cache ENABLE ROW LEVEL SECURITY;
-- Aucune policy = aucun accès pour anon/authenticated

-- ============================================================================
-- CATÉGORIE 7: Table de relation N-N _CompetencePrerequis
-- Filtre via learnos_competences (les deux côtés A et B doivent être du même tenant)
-- ============================================================================

ALTER TABLE "_CompetencePrerequis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY competence_prerequis_tenant ON "_CompetencePrerequis" FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.learnos_competences c1
    WHERE c1.id = "_CompetencePrerequis"."A"
      AND c1."tenantId" = current_tenant_id()
  )
  AND EXISTS (
    SELECT 1 FROM public.learnos_competences c2
    WHERE c2.id = "_CompetencePrerequis"."B"
      AND c2."tenantId" = current_tenant_id()
  )
);

-- ============================================================================
-- FORCE RLS sur toutes les tables (même pour les owners)
-- Empêche le bypass par le rôle owner (sécurité maximale)
-- Le service_role de Supabase bypass RLS automatiquement (par design)
-- ============================================================================

ALTER TABLE public.budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.depenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.devoirs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_ai_decision_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_calibration_seuils FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_chapitres FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_competences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_evaluation_competences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_journal_apprentissage FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_kpi_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_patterns_pedago FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_planification_chapitres FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_planification_competences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_plans_lecon FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_rubriques_evaluation FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_seuils_recommandation FORCE ROW LEVEL SECURITY;
ALTER TABLE public.remplacements_cours FORCE ROW LEVEL SECURITY;
ALTER TABLE public.structures FORCE ROW LEVEL SECURITY;
ALTER TABLE public.taches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tarifs_niveau FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entretiens_conseiller FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fiches_sanitaires FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_alertes_parent FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_echanges_parent FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_feuilles_exercices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_learning_evidences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_plans_progression FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_predictions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_recommandations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_student_interventions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_student_learning_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.passages_infirmerie FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.conseils FORCE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_lien_parent FORCE ROW LEVEL SECURITY;
ALTER TABLE public.exclusions_eleve FORCE ROW LEVEL SECURITY;
ALTER TABLE public.historique_classes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_preferences_parent FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mentorats FORCE ROW LEVEL SECURITY;
ALTER TABLE public.module_activations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.relances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.resolutions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_sites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.echeanciers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.echeances_paiement FORCE ROW LEVEL SECURITY;
ALTER TABLE public.evenements_calendaires FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_etapes_plan FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_exercices_assignes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_exercices_reponses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.membres_conseil FORCE ROW LEVEL SECURITY;
ALTER TABLE public.objectifs_mentorat FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reunions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seances_mentorat FORCE ROW LEVEL SECURITY;
ALTER TABLE public.modules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learnos_ai_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE "_CompetencePrerequis" FORCE ROW LEVEL SECURITY;

-- remises_caisse (ajout migration caisse)
ALTER TABLE public.remises_caisse ENABLE ROW LEVEL SECURITY;
CREATE POLICY remises_caisse_tenant_isolation ON public.remises_caisse FOR ALL USING ("tenantId" = current_tenant_id());
CREATE POLICY remises_caisse_site_isolation ON public.remises_caisse FOR ALL USING ("tenantId" = current_tenant_id() AND site_matches("siteId"));
ALTER TABLE public.remises_caisse FORCE ROW LEVEL SECURITY;

COMMIT;
