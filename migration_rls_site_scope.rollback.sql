-- Retour arrière de migration_rls_site_scope.sql — état relevé le 2026-10-05T20:06:18.149Z
BEGIN;
-- Politiques : on retire tout, puis on recrée l'état d'origine.
DO $$ DECLARE p RECORD; BEGIN FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename); END LOOP; END $$;
CREATE POLICY "competence_prerequis_tenant" ON public."_CompetencePrerequis" AS PERMISSIVE FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM learnos_competences c1
  WHERE ((c1.id = "_CompetencePrerequis"."A") AND (c1."tenantId" = current_tenant_id())))) AND (EXISTS ( SELECT 1
   FROM learnos_competences c2
  WHERE ((c2.id = "_CompetencePrerequis"."B") AND (c2."tenantId" = current_tenant_id()))))));
CREATE POLICY "absences_site_isolation" ON public."absences" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = absences."eleveId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "absences_tenant_isolation" ON public."absences" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "absences_personnel_tenant" ON public."absences_personnel" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "affectations_enseignants_tenant" ON public."affectations_enseignants" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "alumni_site_isolation" ON public."alumni" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "annees_tenant_isolation" ON public."annees_scolaires" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "audit_logs_tenant" ON public."audit_logs" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "budgets_site_isolation" ON public."budgets" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "budgets_tenant_isolation" ON public."budgets" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "bulletin_historique_tenant" ON public."bulletin_historique" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "bulletin_matieres_site_isolation" ON public."bulletin_matieres" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM (bulletins b
     JOIN eleves e ON ((e.id = b."eleveId")))
  WHERE ((b.id = bulletin_matieres."bulletinId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "bulletin_matieres_tenant" ON public."bulletin_matieres" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM bulletins b
  WHERE ((b.id = bulletin_matieres."bulletinId") AND (b."tenantId" = current_tenant_id())))));
CREATE POLICY "bulletins_site_isolation" ON public."bulletins" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = bulletins."eleveId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "bulletins_tenant_isolation" ON public."bulletins" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "bulletins_paie_tenant" ON public."bulletins_paie" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM fiches_rh p
  WHERE ((p.id = bulletins_paie."ficheRHId") AND (p."tenantId" = current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM fiches_rh p
  WHERE ((p.id = bulletins_paie."ficheRHId") AND (p."tenantId" = current_tenant_id())))));
CREATE POLICY "campagne_reinscription_tenant_isolation" ON public."campagne_reinscription" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "candidatures_site_isolation" ON public."candidatures" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "classes_site_isolation" ON public."classes" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "classes_tenant_isolation" ON public."classes" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "conges_personnel_tenant" ON public."conges_personnel" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "conseils_tenant" ON public."conseils" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "contenus_cours_site_isolation" ON public."contenus_cours" AS PERMISSIVE FOR ALL TO public USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM cours c
  WHERE ((c.id = contenus_cours."coursId") AND ((c."siteId" = current_site_id()) OR (c."siteId" IS NULL)))))));
CREATE POLICY "conv_participants_tenant" ON public."conversation_participants" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_participants."conversationId") AND (c."tenantId" = current_tenant_id())))));
CREATE POLICY "conversations_tenant_isolation" ON public."conversations" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "cours_site_isolation" ON public."cours" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "demandes_fournitures_tenant" ON public."demandes_fournitures" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "demandes_lien_parent_tenant" ON public."demandes_lien_parent" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "depenses_site_isolation" ON public."depenses" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "depenses_tenant_isolation" ON public."depenses" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "device_tokens_tenant" ON public."device_tokens" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = device_tokens."userId") AND ((u."tenantId" = current_tenant_id()) OR (u."tenantId" IS NULL))))));
CREATE POLICY "devoirs_site_isolation" ON public."devoirs" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "devoirs_tenant_isolation" ON public."devoirs" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "dispenses_site_isolation" ON public."dispenses_matiere" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = dispenses_matiere."eleveId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "disponibilites_enseignants_tenant" ON public."disponibilites_enseignants" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "documents_site_isolation" ON public."documents" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR ("eleveId" IS NULL) OR (EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = documents."eleveId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "echeances_paiement_tenant" ON public."echeances_paiement" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = echeances_paiement."factureId") AND (f."tenantId" = current_tenant_id())))));
CREATE POLICY "echeanciers_tenant" ON public."echeanciers" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = echeanciers."factureId") AND (f."tenantId" = current_tenant_id())))));
CREATE POLICY "eleve_parents_tenant" ON public."eleve_parents" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = eleve_parents."eleveId") AND (e."tenantId" = current_tenant_id())))));
CREATE POLICY "eleves_site_isolation" ON public."eleves" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "eleves_tenant_isolation" ON public."eleves" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "emplois_temps_site_isolation" ON public."emplois_temps" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = emplois_temps."classeId") AND ((c."siteId" = current_site_id()) OR (c."siteId" IS NULL))))))));
CREATE POLICY "emplois_tenant_isolation" ON public."emplois_temps" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "enseignant_sites_tenant" ON public."enseignant_sites" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM sites p
  WHERE ((p.id = enseignant_sites."siteId") AND (p."tenantId" = current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sites p
  WHERE ((p.id = enseignant_sites."siteId") AND (p."tenantId" = current_tenant_id())))));
CREATE POLICY "enseignants_tenant_isolation" ON public."enseignants" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "entretiens_conseiller_site" ON public."entretiens_conseiller" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "entretiens_conseiller_tenant" ON public."entretiens_conseiller" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "evaluations_site_isolation" ON public."evaluations" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = evaluations."classeId") AND ((c."siteId" = current_site_id()) OR (c."siteId" IS NULL))))))));
CREATE POLICY "evaluations_tenant_isolation" ON public."evaluations" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "evenements_site_isolation" ON public."evenements" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "evenements_tenant_isolation" ON public."evenements" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "evenements_calendaires_tenant" ON public."evenements_calendaires" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM annees_scolaires a
  WHERE ((a.id = evenements_calendaires."anneeId") AND (a."tenantId" = current_tenant_id())))));
CREATE POLICY "examens_site_isolation" ON public."examens" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "examens_tenant_isolation" ON public."examens" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "exclusions_eleve_tenant" ON public."exclusions_eleve" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "factures_site_isolation" ON public."factures" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "factures_tenant_isolation" ON public."factures" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "fiches_rh_tenant" ON public."fiches_rh" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "fiches_sanitaires_site" ON public."fiches_sanitaires" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "fiches_sanitaires_tenant" ON public."fiches_sanitaires" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "historique_classes_tenant" ON public."historique_classes" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "incidents_site_isolation" ON public."incidents" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = incidents."eleveId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "incidents_tenant_isolation" ON public."incidents" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "indisponibilites_enseignants_tenant" ON public."indisponibilites_enseignants" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "inscription_historique_tenant" ON public."inscription_historique" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "inventaire_site_isolation" ON public."inventaire" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "invitation_reinscription_tenant_isolation" ON public."invitation_reinscription" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_ai_decision_logs_site" ON public."learnos_ai_decision_logs" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_ai_decision_logs_tenant" ON public."learnos_ai_decision_logs" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_alertes_parent_site" ON public."learnos_alertes_parent" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_alertes_parent_tenant" ON public."learnos_alertes_parent" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_calibration_seuils_site" ON public."learnos_calibration_seuils" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_calibration_seuils_tenant" ON public."learnos_calibration_seuils" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_chapitres_site" ON public."learnos_chapitres" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_chapitres_tenant" ON public."learnos_chapitres" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_competences_site" ON public."learnos_competences" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_competences_tenant" ON public."learnos_competences" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_echanges_parent_site" ON public."learnos_echanges_parent" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_echanges_parent_tenant" ON public."learnos_echanges_parent" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_etapes_plan_tenant" ON public."learnos_etapes_plan" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM learnos_plans_progression p
  WHERE ((p.id = learnos_etapes_plan."planId") AND (p."tenantId" = current_tenant_id())))));
CREATE POLICY "learnos_eval_comp_site" ON public."learnos_evaluation_competences" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_eval_comp_tenant" ON public."learnos_evaluation_competences" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_events_site" ON public."learnos_events" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_events_tenant" ON public."learnos_events" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_exercices_assignes_tenant" ON public."learnos_exercices_assignes" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM learnos_feuilles_exercices f
  WHERE ((f.id = learnos_exercices_assignes."feuilleId") AND (f."tenantId" = current_tenant_id())))));
CREATE POLICY "learnos_exercices_reponses_tenant" ON public."learnos_exercices_reponses" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (learnos_exercices_assignes ea
     JOIN learnos_feuilles_exercices fe ON ((fe.id = ea."feuilleId")))
  WHERE ((ea.id = learnos_exercices_reponses."exerciceAssigneId") AND (fe."tenantId" = current_tenant_id())))));
CREATE POLICY "learnos_feuilles_ex_site" ON public."learnos_feuilles_exercices" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_feuilles_ex_tenant" ON public."learnos_feuilles_exercices" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_journal_app_site" ON public."learnos_journal_apprentissage" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_journal_app_tenant" ON public."learnos_journal_apprentissage" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_kpi_snapshots_site" ON public."learnos_kpi_snapshots" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_kpi_snapshots_tenant" ON public."learnos_kpi_snapshots" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_learning_evidences_site" ON public."learnos_learning_evidences" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_learning_evidences_tenant" ON public."learnos_learning_evidences" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_patterns_pedago_site" ON public."learnos_patterns_pedago" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_patterns_pedago_tenant" ON public."learnos_patterns_pedago" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_plan_chap_site" ON public."learnos_planification_chapitres" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_plan_chap_tenant" ON public."learnos_planification_chapitres" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_plan_comp_site" ON public."learnos_planification_competences" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_plan_comp_tenant" ON public."learnos_planification_competences" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_plans_lecon_site" ON public."learnos_plans_lecon" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_plans_lecon_tenant" ON public."learnos_plans_lecon" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_plans_prog_site" ON public."learnos_plans_progression" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_plans_prog_tenant" ON public."learnos_plans_progression" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_predictions_site" ON public."learnos_predictions" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_predictions_tenant" ON public."learnos_predictions" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_preferences_parent_tenant" ON public."learnos_preferences_parent" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_questions_site" ON public."learnos_questions" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_questions_tenant" ON public."learnos_questions" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_recommandations_site" ON public."learnos_recommandations" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_recommandations_tenant" ON public."learnos_recommandations" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_rubriques_eval_site" ON public."learnos_rubriques_evaluation" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_rubriques_eval_tenant" ON public."learnos_rubriques_evaluation" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_seuils_reco_site" ON public."learnos_seuils_recommandation" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_seuils_reco_tenant" ON public."learnos_seuils_recommandation" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_student_int_site" ON public."learnos_student_interventions" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_student_int_tenant" ON public."learnos_student_interventions" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "learnos_student_lp_site" ON public."learnos_student_learning_profiles" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "learnos_student_lp_tenant" ON public."learnos_student_learning_profiles" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "liste_fourniture_items_tenant" ON public."liste_fourniture_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM listes_fournitures_classes p
  WHERE ((p.id = liste_fourniture_items."listeId") AND (p."tenantId" = current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM listes_fournitures_classes p
  WHERE ((p.id = liste_fourniture_items."listeId") AND (p."tenantId" = current_tenant_id())))));
CREATE POLICY "listes_fournitures_classes_tenant" ON public."listes_fournitures_classes" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "matieres_tenant_isolation" ON public."matieres" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "membres_conseil_tenant" ON public."membres_conseil" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM conseils c
  WHERE ((c.id = membres_conseil."conseilId") AND (c."tenantId" = current_tenant_id())))));
CREATE POLICY "mentorats_tenant" ON public."mentorats" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "messages_tenant" ON public."messages" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages."conversationId") AND (c."tenantId" = current_tenant_id())))));
CREATE POLICY "module_activations_tenant" ON public."module_activations" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "modules_read_all" ON public."modules" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "notes_site_isolation" ON public."notes" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = notes."eleveId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "notes_tenant_isolation" ON public."notes" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "notifications_site_isolation" ON public."notifications" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "notifications_tenant_isolation" ON public."notifications" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "objectifs_mentorat_tenant" ON public."objectifs_mentorat" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM mentorats m
  WHERE ((m.id = objectifs_mentorat."mentoratId") AND (m."tenantId" = current_tenant_id())))));
CREATE POLICY "paiements_site_isolation" ON public."paiements" AS PERMISSIVE FOR ALL TO public USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM factures f
  WHERE ((f.id = paiements."factureId") AND ((f."siteId" = current_site_id()) OR (f."siteId" IS NULL)))))));
CREATE POLICY "parcours_site_isolation" ON public."parcours_scolaires" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND (is_site_admin() OR (EXISTS ( SELECT 1
   FROM eleves e
  WHERE ((e.id = parcours_scolaires."eleveId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL))))))));
CREATE POLICY "parents_tenant_isolation" ON public."parents" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "passages_infirmerie_site" ON public."passages_infirmerie" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "passages_infirmerie_tenant" ON public."passages_infirmerie" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "periodes_tenant" ON public."periodes" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM annees_scolaires a
  WHERE ((a.id = periodes."anneeId") AND (a."tenantId" = current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM annees_scolaires a
  WHERE ((a.id = periodes."anneeId") AND (a."tenantId" = current_tenant_id())))));
CREATE POLICY "progressions_site_isolation" ON public."progressions_eleves" AS PERMISSIVE FOR ALL TO public USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM cours c
  WHERE ((c.id = progressions_eleves."coursId") AND ((c."siteId" = current_site_id()) OR (c."siteId" IS NULL)))))));
CREATE POLICY "regles_appreciation_tenant" ON public."regles_appreciation" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "relances_tenant" ON public."relances" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "remises_caisse_tenant" ON public."remises_caisse" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "remplacements_site" ON public."remplacements_cours" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "remplacements_tenant" ON public."remplacements_cours" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "resolutions_tenant" ON public."resolutions" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "reunions_tenant" ON public."reunions" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM conseils c
  WHERE ((c.id = reunions."conseilId") AND (c."tenantId" = current_tenant_id())))));
CREATE POLICY "salles_site_isolation" ON public."salles" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "sanctions_site_isolation" ON public."sanctions" AS PERMISSIVE FOR ALL TO public USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM (incidents i
     JOIN eleves e ON ((e.id = i."eleveId")))
  WHERE ((i.id = sanctions."incidentId") AND ((e."siteId" = current_site_id()) OR (e."siteId" IS NULL)))))));
CREATE POLICY "seance_commentaires_tenant" ON public."seance_commentaires" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM seances_pedagogiques p
  WHERE ((p.id = seance_commentaires."seanceId") AND (p."tenantId" = current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM seances_pedagogiques p
  WHERE ((p.id = seance_commentaires."seanceId") AND (p."tenantId" = current_tenant_id())))));
CREATE POLICY "seances_competences_tenant" ON public."seances_competences" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM seances_pedagogiques p
  WHERE ((p.id = seances_competences."seanceId") AND (p."tenantId" = current_tenant_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM seances_pedagogiques p
  WHERE ((p.id = seances_competences."seanceId") AND (p."tenantId" = current_tenant_id())))));
CREATE POLICY "seances_mentorat_tenant" ON public."seances_mentorat" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM mentorats m
  WHERE ((m.id = seances_mentorat."mentoratId") AND (m."tenantId" = current_tenant_id())))));
CREATE POLICY "seances_pedagogiques_tenant" ON public."seances_pedagogiques" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "sessions_examen_site_isolation" ON public."sessions_examen" AS PERMISSIVE FOR ALL TO public USING ((is_site_admin() OR (EXISTS ( SELECT 1
   FROM examens ex
  WHERE ((ex.id = sessions_examen."examId") AND ((ex."siteId" = current_site_id()) OR (ex."siteId" IS NULL)))))));
CREATE POLICY "sessions_examen_tenant" ON public."sessions_examen" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM examens e
  WHERE ((e.id = sessions_examen."examId") AND (e."tenantId" = current_tenant_id())))));
CREATE POLICY "site_deletion_logs_admin_write" ON public."site_deletion_logs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));
CREATE POLICY "site_deletion_logs_tenant_isolation" ON public."site_deletion_logs" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_setting('app.tenant_id'::text, true)));
CREATE POLICY "sites_tenant" ON public."sites" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "structures_site" ON public."structures" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "structures_tenant" ON public."structures" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "sync_configs_tenant" ON public."sync_configs" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "taches_site" ON public."taches" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "taches_tenant" ON public."taches" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "tarifs_niveau_site" ON public."tarifs_niveau" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) AND site_matches("siteId")));
CREATE POLICY "tarifs_niveau_tenant" ON public."tarifs_niveau" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "tenant_select_own" ON public."tenants" AS PERMISSIVE FOR SELECT TO public USING ((id = current_tenant_id()));
CREATE POLICY "user_permissions_tenant" ON public."user_permissions" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id())) WITH CHECK (("tenantId" = current_tenant_id()));
CREATE POLICY "user_roles_tenant" ON public."user_roles" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "user_sites_tenant" ON public."user_sites" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM sites s
  WHERE ((s.id = user_sites."siteId") AND (s."tenantId" = current_tenant_id())))));
CREATE POLICY "user_tenants_tenant" ON public."user_tenants" AS PERMISSIVE FOR ALL TO public USING (("tenantId" = current_tenant_id()));
CREATE POLICY "users_site_isolation" ON public."users" AS PERMISSIVE FOR ALL TO public USING (((("tenantId" = current_tenant_id()) OR ("tenantId" IS NULL)) AND site_matches("siteId")));
CREATE POLICY "users_tenant_isolation" ON public."users" AS PERMISSIVE FOR ALL TO public USING ((("tenantId" = current_tenant_id()) OR ("tenantId" IS NULL)));
CREATE OR REPLACE FUNCTION public.set_app_context(p_tenant_id text, p_site_id text, p_site_ids text, p_super_admin boolean)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM set_config('app.tenant_id',   COALESCE(p_tenant_id, ''), true);
  PERFORM set_config('app.site_id',     COALESCE(p_site_id, ''),   true);
  PERFORM set_config('app.site_ids',    COALESCE(p_site_ids, ''),  true);
  PERFORM set_config('app.super_admin', CASE WHEN p_super_admin THEN 'on' ELSE 'off' END, true);
  PERFORM set_config('app.context_set', 'on', true);
END;
$function$;
CREATE OR REPLACE FUNCTION public.site_matches(p_site_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT public.is_super_admin()
      OR p_site_id IS NULL
      OR p_site_id = ANY (public.current_site_ids());
$function$;
DROP FUNCTION IF EXISTS public.set_app_context(TEXT, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.site_scope_unrestricted();
DROP FUNCTION IF EXISTS public.current_site_scope();
COMMIT;
