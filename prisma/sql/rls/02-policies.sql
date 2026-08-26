-- ============================================================
-- EcolPro — Politiques RLS d'isolation multi-tenant
--
-- ⚠️  FICHIER GÉNÉRÉ — NE PAS MODIFIER À LA MAIN.
--     Source : prisma/schema.prisma
--     Générateur : scripts/rls/generate-policies.cjs
--     Régénérer : pnpm rls:generate
--     Vérifier  : pnpm rls:check   (échoue si le schéma a bougé)
--
-- Prérequis : docker/postgres/init/03-rls-functions.sql (fonctions de
-- contexte). Sans elles, ce fichier échoue à la première politique.
--
-- CHOIX : ENABLE, PAS « FORCE »
-- `FORCE ROW LEVEL SECURITY` appliquerait aussi les politiques au
-- PROPRIÉTAIRE des tables (ecolpro_owner). Or c'est ce rôle qui exécute
-- les migrations Prisma et les reprises de données : le forcer ferait
-- échouer silencieusement tout backfill (« 0 ligne mise à jour »).
-- L'application, elle, se connecte en `ecolpro_app` — un rôle NI
-- propriétaire NI superutilisateur : les politiques s'y appliquent
-- pleinement, ce qui est le seul cas qui compte. Le propriétaire n'est
-- utilisé que par un conteneur éphémère, jamais exposé au réseau.
--
-- CHOIX : `TO ecolpro_app`
-- Les politiques ne visent que le rôle applicatif. Le rôle de sauvegarde
-- (`ecolpro_backup`, pg_read_all_data) doit continuer à tout lire — une
-- sauvegarde partielle serait pire qu'inutile.
--
-- USING **et** WITH CHECK
-- USING filtre ce qui est LU (et ce qui peut être modifié/supprimé) ;
-- WITH CHECK contrôle ce qui est ÉCRIT. Sans WITH CHECK, un utilisateur
-- pourrait insérer une ligne au nom d'un autre tenant — invisible pour
-- lui, bien réelle pour la victime.
--
-- Couverture : 117 tables
--    55 tenant + site
--    37 tenant seul
--    25 rattachées via un parent
--     7 exclues (motivées ci-dessous)
--
-- Exclusions :
--   • Tenant — Table des tenants elle-même : elle porte une politique dédiée (voir plus bas), sans quoi la connexion et le changement d'établissement deviendraient impossibles.
--   • Module — Catalogue global des modules fonctionnels (référentiel produit, aucune donnée d'école).
--   • CalendrierOfficiel — Calendrier officiel partagé par pays, volontairement commun à tous les tenants.
--   • AiCache — Cache de réponses IA indexé par empreinte de la requête, sans notion de tenant. À RÉEXAMINER : si une empreinte pouvait coïncider entre deux tenants, une réponse calculée pour l'un serait servie à l'autre. Le correctif n'est pas une politique RLS mais l'ajout du tenantId dans la clé de cache.
--   • Account — Table NextAuth, lue AVANT toute authentification : aucun contexte de tenant n'existe encore à ce stade. Protégée par le fait qu'elle n'est jamais exposée par une route.
--   • Session — Table NextAuth (sessions JWT : de facto inutilisée). Même raison qu'Account.
--   • VerificationToken — Jetons de vérification e-mail, consommés avant authentification. Même raison.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Cas particulier : la table des tenants
-- Un utilisateur doit voir SON tenant (nom, options, abonnement) et rien
-- d'autre. La liste des établissements auxquels il a accès est servie par
-- user_tenants, elle-même filtrée par sa propre politique.
-- ------------------------------------------------------------
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_isolation ON public."tenants";
CREATE POLICY tenants_isolation ON public."tenants"
  FOR ALL
  TO ecolpro_app
  USING ( is_super_admin() OR id = current_tenant_id() )
  WITH CHECK ( is_super_admin() OR id = current_tenant_id() );

-- Absence
ALTER TABLE public."absences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absences_isolation ON public."absences";
CREATE POLICY absences_isolation ON public."absences"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- AbsencePersonnel
ALTER TABLE public."absences_personnel" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS absences_personnel_isolation ON public."absences_personnel";
CREATE POLICY absences_personnel_isolation ON public."absences_personnel"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- AffectationEnseignant
ALTER TABLE public."affectations_enseignants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affectations_enseignants_isolation ON public."affectations_enseignants";
CREATE POLICY affectations_enseignants_isolation ON public."affectations_enseignants"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Alumni
ALTER TABLE public."alumni" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alumni_isolation ON public."alumni";
CREATE POLICY alumni_isolation ON public."alumni"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- AnneesScolaires
ALTER TABLE public."annees_scolaires" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS annees_scolaires_isolation ON public."annees_scolaires";
CREATE POLICY annees_scolaires_isolation ON public."annees_scolaires"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- AuditLog
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_isolation ON public."audit_logs";
CREATE POLICY audit_logs_isolation ON public."audit_logs"
  FOR ALL
  TO ecolpro_app
  USING (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
  )
  WITH CHECK (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
  );

-- Budget
ALTER TABLE public."budgets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budgets_isolation ON public."budgets";
CREATE POLICY budgets_isolation ON public."budgets"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- BulletinHistorique
ALTER TABLE public."bulletin_historique" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bulletin_historique_isolation ON public."bulletin_historique";
CREATE POLICY bulletin_historique_isolation ON public."bulletin_historique"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- BulletinMatiere
ALTER TABLE public."bulletin_matieres" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bulletin_matieres_isolation ON public."bulletin_matieres";
CREATE POLICY bulletin_matieres_isolation ON public."bulletin_matieres"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Bulletin
ALTER TABLE public."bulletins" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bulletins_isolation ON public."bulletins";
CREATE POLICY bulletins_isolation ON public."bulletins"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- BulletinPaie
ALTER TABLE public."bulletins_paie" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bulletins_paie_isolation ON public."bulletins_paie";
CREATE POLICY bulletins_paie_isolation ON public."bulletins_paie"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.fiches_rh p0
        WHERE p0.id = "ficheRHId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.fiches_rh p0
        WHERE p0.id = "ficheRHId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- Candidature
ALTER TABLE public."candidatures" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS candidatures_isolation ON public."candidatures";
CREATE POLICY candidatures_isolation ON public."candidatures"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Classe
ALTER TABLE public."classes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classes_isolation ON public."classes";
CREATE POLICY classes_isolation ON public."classes"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- CongePersonnel
ALTER TABLE public."conges_personnel" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conges_personnel_isolation ON public."conges_personnel";
CREATE POLICY conges_personnel_isolation ON public."conges_personnel"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Conseil
ALTER TABLE public."conseils" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conseils_isolation ON public."conseils";
CREATE POLICY conseils_isolation ON public."conseils"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- ContenuCours
ALTER TABLE public."contenus_cours" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contenus_cours_isolation ON public."contenus_cours";
CREATE POLICY contenus_cours_isolation ON public."contenus_cours"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.cours p0
        WHERE p0.id = "coursId"
          AND (p0."tenantId" IS NULL OR tenant_matches(p0."tenantId"))
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.cours p0
        WHERE p0.id = "coursId"
          AND (p0."tenantId" IS NULL OR tenant_matches(p0."tenantId"))
        AND site_matches(p0."siteId")
        )
  );

-- ConversationParticipant
ALTER TABLE public."conversation_participants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_participants_isolation ON public."conversation_participants";
CREATE POLICY conversation_participants_isolation ON public."conversation_participants"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.conversations p0
        WHERE p0.id = "conversationId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.conversations p0
        WHERE p0.id = "conversationId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- Conversation
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_isolation ON public."conversations";
CREATE POLICY conversations_isolation ON public."conversations"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Cours
ALTER TABLE public."cours" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cours_isolation ON public."cours";
CREATE POLICY cours_isolation ON public."cours"
  FOR ALL
  TO ecolpro_app
  USING (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  )
  WITH CHECK (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  );

-- DemandeFourniture
ALTER TABLE public."demandes_fournitures" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demandes_fournitures_isolation ON public."demandes_fournitures";
CREATE POLICY demandes_fournitures_isolation ON public."demandes_fournitures"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- DemandeLienParent
ALTER TABLE public."demandes_lien_parent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demandes_lien_parent_isolation ON public."demandes_lien_parent";
CREATE POLICY demandes_lien_parent_isolation ON public."demandes_lien_parent"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Depense
ALTER TABLE public."depenses" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS depenses_isolation ON public."depenses";
CREATE POLICY depenses_isolation ON public."depenses"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- DeviceToken
ALTER TABLE public."device_tokens" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_tokens_isolation ON public."device_tokens";
CREATE POLICY device_tokens_isolation ON public."device_tokens"
  FOR ALL
  TO ecolpro_app
  USING (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
  )
  WITH CHECK (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
  );

-- Devoir
ALTER TABLE public."devoirs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devoirs_isolation ON public."devoirs";
CREATE POLICY devoirs_isolation ON public."devoirs"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- DispenseMatiere
ALTER TABLE public."dispenses_matiere" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispenses_matiere_isolation ON public."dispenses_matiere";
CREATE POLICY dispenses_matiere_isolation ON public."dispenses_matiere"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- DisponibiliteEnseignant
ALTER TABLE public."disponibilites_enseignants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disponibilites_enseignants_isolation ON public."disponibilites_enseignants";
CREATE POLICY disponibilites_enseignants_isolation ON public."disponibilites_enseignants"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Document
ALTER TABLE public."documents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_isolation ON public."documents";
CREATE POLICY documents_isolation ON public."documents"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- EcheancePaiement
ALTER TABLE public."echeances_paiement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS echeances_paiement_isolation ON public."echeances_paiement";
CREATE POLICY echeances_paiement_isolation ON public."echeances_paiement"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.factures p0
        WHERE p0.id = "factureId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.factures p0
        WHERE p0.id = "factureId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- Echeancier
ALTER TABLE public."echeanciers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS echeanciers_isolation ON public."echeanciers";
CREATE POLICY echeanciers_isolation ON public."echeanciers"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.factures p0
        WHERE p0.id = "factureId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.factures p0
        WHERE p0.id = "factureId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- EleveParent
ALTER TABLE public."eleve_parents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eleve_parents_isolation ON public."eleve_parents";
CREATE POLICY eleve_parents_isolation ON public."eleve_parents"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.eleves p0
        WHERE p0.id = "eleveId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.eleves p0
        WHERE p0.id = "eleveId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- Eleve
ALTER TABLE public."eleves" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS eleves_isolation ON public."eleves";
CREATE POLICY eleves_isolation ON public."eleves"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- EmploiTemps
ALTER TABLE public."emplois_temps" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emplois_temps_isolation ON public."emplois_temps";
CREATE POLICY emplois_temps_isolation ON public."emplois_temps"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- EnseignantSite
ALTER TABLE public."enseignant_sites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enseignant_sites_isolation ON public."enseignant_sites";
CREATE POLICY enseignant_sites_isolation ON public."enseignant_sites"
  FOR ALL
  TO ecolpro_app
  USING (
      site_matches("siteId")
  )
  WITH CHECK (
      site_matches("siteId")
  );

-- Enseignant
ALTER TABLE public."enseignants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enseignants_isolation ON public."enseignants";
CREATE POLICY enseignants_isolation ON public."enseignants"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- EntretienConseiller
ALTER TABLE public."entretiens_conseiller" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entretiens_conseiller_isolation ON public."entretiens_conseiller";
CREATE POLICY entretiens_conseiller_isolation ON public."entretiens_conseiller"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Evaluation
ALTER TABLE public."evaluations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evaluations_isolation ON public."evaluations";
CREATE POLICY evaluations_isolation ON public."evaluations"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Evenement
ALTER TABLE public."evenements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evenements_isolation ON public."evenements";
CREATE POLICY evenements_isolation ON public."evenements"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- EvenementCalendaire
ALTER TABLE public."evenements_calendaires" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evenements_calendaires_isolation ON public."evenements_calendaires";
CREATE POLICY evenements_calendaires_isolation ON public."evenements_calendaires"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.annees_scolaires p0
        WHERE p0.id = "anneeId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.annees_scolaires p0
        WHERE p0.id = "anneeId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- Examen
ALTER TABLE public."examens" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS examens_isolation ON public."examens";
CREATE POLICY examens_isolation ON public."examens"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- ExclusionEleve
ALTER TABLE public."exclusions_eleve" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exclusions_eleve_isolation ON public."exclusions_eleve";
CREATE POLICY exclusions_eleve_isolation ON public."exclusions_eleve"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Facture
ALTER TABLE public."factures" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factures_isolation ON public."factures";
CREATE POLICY factures_isolation ON public."factures"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- FicheRH
ALTER TABLE public."fiches_rh" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiches_rh_isolation ON public."fiches_rh";
CREATE POLICY fiches_rh_isolation ON public."fiches_rh"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- FicheSanitaire
ALTER TABLE public."fiches_sanitaires" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fiches_sanitaires_isolation ON public."fiches_sanitaires";
CREATE POLICY fiches_sanitaires_isolation ON public."fiches_sanitaires"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- HistoriqueClasse
ALTER TABLE public."historique_classes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historique_classes_isolation ON public."historique_classes";
CREATE POLICY historique_classes_isolation ON public."historique_classes"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Incident
ALTER TABLE public."incidents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incidents_isolation ON public."incidents";
CREATE POLICY incidents_isolation ON public."incidents"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- IndisponibiliteEnseignant
ALTER TABLE public."indisponibilites_enseignants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS indisponibilites_enseignants_isolation ON public."indisponibilites_enseignants";
CREATE POLICY indisponibilites_enseignants_isolation ON public."indisponibilites_enseignants"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- InscriptionHistorique
ALTER TABLE public."inscription_historique" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inscription_historique_isolation ON public."inscription_historique";
CREATE POLICY inscription_historique_isolation ON public."inscription_historique"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- ItemInventaire
ALTER TABLE public."inventaire" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventaire_isolation ON public."inventaire";
CREATE POLICY inventaire_isolation ON public."inventaire"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- AiDecisionLog
ALTER TABLE public."learnos_ai_decision_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_ai_decision_logs_isolation ON public."learnos_ai_decision_logs";
CREATE POLICY learnos_ai_decision_logs_isolation ON public."learnos_ai_decision_logs"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- AlerteParent
ALTER TABLE public."learnos_alertes_parent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_alertes_parent_isolation ON public."learnos_alertes_parent";
CREATE POLICY learnos_alertes_parent_isolation ON public."learnos_alertes_parent"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- CalibrationSeuil
ALTER TABLE public."learnos_calibration_seuils" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_calibration_seuils_isolation ON public."learnos_calibration_seuils";
CREATE POLICY learnos_calibration_seuils_isolation ON public."learnos_calibration_seuils"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Chapitre
ALTER TABLE public."learnos_chapitres" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_chapitres_isolation ON public."learnos_chapitres";
CREATE POLICY learnos_chapitres_isolation ON public."learnos_chapitres"
  FOR ALL
  TO ecolpro_app
  USING (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  )
  WITH CHECK (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  );

-- Competence
ALTER TABLE public."learnos_competences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_competences_isolation ON public."learnos_competences";
CREATE POLICY learnos_competences_isolation ON public."learnos_competences"
  FOR ALL
  TO ecolpro_app
  USING (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  )
  WITH CHECK (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  );

-- EchangeParent
ALTER TABLE public."learnos_echanges_parent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_echanges_parent_isolation ON public."learnos_echanges_parent";
CREATE POLICY learnos_echanges_parent_isolation ON public."learnos_echanges_parent"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- EtapePlan
ALTER TABLE public."learnos_etapes_plan" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_etapes_plan_isolation ON public."learnos_etapes_plan";
CREATE POLICY learnos_etapes_plan_isolation ON public."learnos_etapes_plan"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.learnos_plans_progression p0
        WHERE p0.id = "planId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learnos_plans_progression p0
        WHERE p0.id = "planId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- EvaluationCompetence
ALTER TABLE public."learnos_evaluation_competences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_evaluation_competences_isolation ON public."learnos_evaluation_competences";
CREATE POLICY learnos_evaluation_competences_isolation ON public."learnos_evaluation_competences"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- LearnosEvent
ALTER TABLE public."learnos_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_events_isolation ON public."learnos_events";
CREATE POLICY learnos_events_isolation ON public."learnos_events"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- ExerciceAssigne
ALTER TABLE public."learnos_exercices_assignes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_exercices_assignes_isolation ON public."learnos_exercices_assignes";
CREATE POLICY learnos_exercices_assignes_isolation ON public."learnos_exercices_assignes"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.learnos_feuilles_exercices p0
        WHERE p0.id = "feuilleId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learnos_feuilles_exercices p0
        WHERE p0.id = "feuilleId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- ExerciceReponse
ALTER TABLE public."learnos_exercices_reponses" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_exercices_reponses_isolation ON public."learnos_exercices_reponses";
CREATE POLICY learnos_exercices_reponses_isolation ON public."learnos_exercices_reponses"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.learnos_exercices_assignes p0
        WHERE p0.id = "exerciceAssigneId"
          AND EXISTS (
          SELECT 1 FROM public.learnos_feuilles_exercices p1
          WHERE p1.id = p0."feuilleId"
            AND tenant_matches(p1."tenantId")
          AND site_matches(p1."siteId")
          )
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learnos_exercices_assignes p0
        WHERE p0.id = "exerciceAssigneId"
          AND EXISTS (
          SELECT 1 FROM public.learnos_feuilles_exercices p1
          WHERE p1.id = p0."feuilleId"
            AND tenant_matches(p1."tenantId")
          AND site_matches(p1."siteId")
          )
        )
  );

-- FeuilleExercices
ALTER TABLE public."learnos_feuilles_exercices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_feuilles_exercices_isolation ON public."learnos_feuilles_exercices";
CREATE POLICY learnos_feuilles_exercices_isolation ON public."learnos_feuilles_exercices"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- JournalApprentissage
ALTER TABLE public."learnos_journal_apprentissage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_journal_apprentissage_isolation ON public."learnos_journal_apprentissage";
CREATE POLICY learnos_journal_apprentissage_isolation ON public."learnos_journal_apprentissage"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- KpiSnapshot
ALTER TABLE public."learnos_kpi_snapshots" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_kpi_snapshots_isolation ON public."learnos_kpi_snapshots";
CREATE POLICY learnos_kpi_snapshots_isolation ON public."learnos_kpi_snapshots"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- LearningEvidence
ALTER TABLE public."learnos_learning_evidences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_learning_evidences_isolation ON public."learnos_learning_evidences";
CREATE POLICY learnos_learning_evidences_isolation ON public."learnos_learning_evidences"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- PatternPedagogique
ALTER TABLE public."learnos_patterns_pedago" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_patterns_pedago_isolation ON public."learnos_patterns_pedago";
CREATE POLICY learnos_patterns_pedago_isolation ON public."learnos_patterns_pedago"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- PlanificationChapitre
ALTER TABLE public."learnos_planification_chapitres" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_planification_chapitres_isolation ON public."learnos_planification_chapitres";
CREATE POLICY learnos_planification_chapitres_isolation ON public."learnos_planification_chapitres"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- PlanificationCompetence
ALTER TABLE public."learnos_planification_competences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_planification_competences_isolation ON public."learnos_planification_competences";
CREATE POLICY learnos_planification_competences_isolation ON public."learnos_planification_competences"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- PlanLecon
ALTER TABLE public."learnos_plans_lecon" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_plans_lecon_isolation ON public."learnos_plans_lecon";
CREATE POLICY learnos_plans_lecon_isolation ON public."learnos_plans_lecon"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- PlanProgression
ALTER TABLE public."learnos_plans_progression" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_plans_progression_isolation ON public."learnos_plans_progression";
CREATE POLICY learnos_plans_progression_isolation ON public."learnos_plans_progression"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- PredictionDifficulte
ALTER TABLE public."learnos_predictions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_predictions_isolation ON public."learnos_predictions";
CREATE POLICY learnos_predictions_isolation ON public."learnos_predictions"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- PreferencesParent
ALTER TABLE public."learnos_preferences_parent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_preferences_parent_isolation ON public."learnos_preferences_parent";
CREATE POLICY learnos_preferences_parent_isolation ON public."learnos_preferences_parent"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Question
ALTER TABLE public."learnos_questions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_questions_isolation ON public."learnos_questions";
CREATE POLICY learnos_questions_isolation ON public."learnos_questions"
  FOR ALL
  TO ecolpro_app
  USING (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  )
  WITH CHECK (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  );

-- Recommandation
ALTER TABLE public."learnos_recommandations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_recommandations_isolation ON public."learnos_recommandations";
CREATE POLICY learnos_recommandations_isolation ON public."learnos_recommandations"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- RubriqueEvaluation
ALTER TABLE public."learnos_rubriques_evaluation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_rubriques_evaluation_isolation ON public."learnos_rubriques_evaluation";
CREATE POLICY learnos_rubriques_evaluation_isolation ON public."learnos_rubriques_evaluation"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- SeuilsRecommandation
ALTER TABLE public."learnos_seuils_recommandation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_seuils_recommandation_isolation ON public."learnos_seuils_recommandation";
CREATE POLICY learnos_seuils_recommandation_isolation ON public."learnos_seuils_recommandation"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- StudentIntervention
ALTER TABLE public."learnos_student_interventions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_student_interventions_isolation ON public."learnos_student_interventions";
CREATE POLICY learnos_student_interventions_isolation ON public."learnos_student_interventions"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- StudentLearningProfile
ALTER TABLE public."learnos_student_learning_profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learnos_student_learning_profiles_isolation ON public."learnos_student_learning_profiles";
CREATE POLICY learnos_student_learning_profiles_isolation ON public."learnos_student_learning_profiles"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- ListeFournitureItem
ALTER TABLE public."liste_fourniture_items" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS liste_fourniture_items_isolation ON public."liste_fourniture_items";
CREATE POLICY liste_fourniture_items_isolation ON public."liste_fourniture_items"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.listes_fournitures_classes p0
        WHERE p0.id = "listeId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.listes_fournitures_classes p0
        WHERE p0.id = "listeId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- ListeFournitureClasse
ALTER TABLE public."listes_fournitures_classes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS listes_fournitures_classes_isolation ON public."listes_fournitures_classes";
CREATE POLICY listes_fournitures_classes_isolation ON public."listes_fournitures_classes"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Matiere
ALTER TABLE public."matieres" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matieres_isolation ON public."matieres";
CREATE POLICY matieres_isolation ON public."matieres"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- MembreConseil
ALTER TABLE public."membres_conseil" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membres_conseil_isolation ON public."membres_conseil";
CREATE POLICY membres_conseil_isolation ON public."membres_conseil"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.conseils p0
        WHERE p0.id = "conseilId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.conseils p0
        WHERE p0.id = "conseilId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- Mentorat
ALTER TABLE public."mentorats" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mentorats_isolation ON public."mentorats";
CREATE POLICY mentorats_isolation ON public."mentorats"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Message
ALTER TABLE public."messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_isolation ON public."messages";
CREATE POLICY messages_isolation ON public."messages"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.conversations p0
        WHERE p0.id = "conversationId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.conversations p0
        WHERE p0.id = "conversationId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- ModuleActivation
ALTER TABLE public."module_activations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS module_activations_isolation ON public."module_activations";
CREATE POLICY module_activations_isolation ON public."module_activations"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Note
ALTER TABLE public."notes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notes_isolation ON public."notes";
CREATE POLICY notes_isolation ON public."notes"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Notification
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_isolation ON public."notifications";
CREATE POLICY notifications_isolation ON public."notifications"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- ObjectifMentorat
ALTER TABLE public."objectifs_mentorat" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS objectifs_mentorat_isolation ON public."objectifs_mentorat";
CREATE POLICY objectifs_mentorat_isolation ON public."objectifs_mentorat"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.mentorats p0
        WHERE p0.id = "mentoratId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.mentorats p0
        WHERE p0.id = "mentoratId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- Paiement
ALTER TABLE public."paiements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paiements_isolation ON public."paiements";
CREATE POLICY paiements_isolation ON public."paiements"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.factures p0
        WHERE p0.id = "factureId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.factures p0
        WHERE p0.id = "factureId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- ParcoursScolaire
ALTER TABLE public."parcours_scolaires" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parcours_scolaires_isolation ON public."parcours_scolaires";
CREATE POLICY parcours_scolaires_isolation ON public."parcours_scolaires"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Parent
ALTER TABLE public."parents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parents_isolation ON public."parents";
CREATE POLICY parents_isolation ON public."parents"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- PassageInfirmerie
ALTER TABLE public."passages_infirmerie" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passages_infirmerie_isolation ON public."passages_infirmerie";
CREATE POLICY passages_infirmerie_isolation ON public."passages_infirmerie"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Periode
ALTER TABLE public."periodes" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS periodes_isolation ON public."periodes";
CREATE POLICY periodes_isolation ON public."periodes"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.annees_scolaires p0
        WHERE p0.id = "anneeId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.annees_scolaires p0
        WHERE p0.id = "anneeId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- ProgressionEleve
ALTER TABLE public."progressions_eleves" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progressions_eleves_isolation ON public."progressions_eleves";
CREATE POLICY progressions_eleves_isolation ON public."progressions_eleves"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- ReglesAppreciation
ALTER TABLE public."regles_appreciation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regles_appreciation_isolation ON public."regles_appreciation";
CREATE POLICY regles_appreciation_isolation ON public."regles_appreciation"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Relance
ALTER TABLE public."relances" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relances_isolation ON public."relances";
CREATE POLICY relances_isolation ON public."relances"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- RemiseCaisse
ALTER TABLE public."remises_caisse" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS remises_caisse_isolation ON public."remises_caisse";
CREATE POLICY remises_caisse_isolation ON public."remises_caisse"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- RemplacementCours
ALTER TABLE public."remplacements_cours" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS remplacements_cours_isolation ON public."remplacements_cours";
CREATE POLICY remplacements_cours_isolation ON public."remplacements_cours"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Résolution
ALTER TABLE public."resolutions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resolutions_isolation ON public."resolutions";
CREATE POLICY resolutions_isolation ON public."resolutions"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Réunion
ALTER TABLE public."reunions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reunions_isolation ON public."reunions";
CREATE POLICY reunions_isolation ON public."reunions"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.conseils p0
        WHERE p0.id = "conseilId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.conseils p0
        WHERE p0.id = "conseilId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- Salle
ALTER TABLE public."salles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS salles_isolation ON public."salles";
CREATE POLICY salles_isolation ON public."salles"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Sanction
ALTER TABLE public."sanctions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sanctions_isolation ON public."sanctions";
CREATE POLICY sanctions_isolation ON public."sanctions"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.incidents p0
        WHERE p0.id = "incidentId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.incidents p0
        WHERE p0.id = "incidentId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- SeanceCommentaire
ALTER TABLE public."seance_commentaires" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seance_commentaires_isolation ON public."seance_commentaires";
CREATE POLICY seance_commentaires_isolation ON public."seance_commentaires"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.seances_pedagogiques p0
        WHERE p0.id = "seanceId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.seances_pedagogiques p0
        WHERE p0.id = "seanceId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- SeanceCompetence
ALTER TABLE public."seances_competences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seances_competences_isolation ON public."seances_competences";
CREATE POLICY seances_competences_isolation ON public."seances_competences"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.seances_pedagogiques p0
        WHERE p0.id = "seanceId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.seances_pedagogiques p0
        WHERE p0.id = "seanceId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- SeanceMentorat
ALTER TABLE public."seances_mentorat" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seances_mentorat_isolation ON public."seances_mentorat";
CREATE POLICY seances_mentorat_isolation ON public."seances_mentorat"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.mentorats p0
        WHERE p0.id = "mentoratId"
          AND tenant_matches(p0."tenantId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.mentorats p0
        WHERE p0.id = "mentoratId"
          AND tenant_matches(p0."tenantId")
        )
  );

-- SeancePedagogique
ALTER TABLE public."seances_pedagogiques" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seances_pedagogiques_isolation ON public."seances_pedagogiques";
CREATE POLICY seances_pedagogiques_isolation ON public."seances_pedagogiques"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- SessionExamen
ALTER TABLE public."sessions_examen" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_examen_isolation ON public."sessions_examen";
CREATE POLICY sessions_examen_isolation ON public."sessions_examen"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.examens p0
        WHERE p0.id = "examId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.examens p0
        WHERE p0.id = "examId"
          AND tenant_matches(p0."tenantId")
        AND site_matches(p0."siteId")
        )
  );

-- SiteDeletionLog
ALTER TABLE public."site_deletion_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_deletion_logs_isolation ON public."site_deletion_logs";
CREATE POLICY site_deletion_logs_isolation ON public."site_deletion_logs"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- Site
ALTER TABLE public."sites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sites_isolation ON public."sites";
CREATE POLICY sites_isolation ON public."sites"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Structure
ALTER TABLE public."structures" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS structures_isolation ON public."structures";
CREATE POLICY structures_isolation ON public."structures"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- SyncConfig
ALTER TABLE public."sync_configs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_configs_isolation ON public."sync_configs";
CREATE POLICY sync_configs_isolation ON public."sync_configs"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- Tache
ALTER TABLE public."taches" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS taches_isolation ON public."taches";
CREATE POLICY taches_isolation ON public."taches"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- TarifNiveau
ALTER TABLE public."tarifs_niveau" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tarifs_niveau_isolation ON public."tarifs_niveau";
CREATE POLICY tarifs_niveau_isolation ON public."tarifs_niveau"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
      AND site_matches("siteId")
  );

-- UserPermission
ALTER TABLE public."user_permissions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_permissions_isolation ON public."user_permissions";
CREATE POLICY user_permissions_isolation ON public."user_permissions"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- UserRole
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_isolation ON public."user_roles";
CREATE POLICY user_roles_isolation ON public."user_roles"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- UserSite
ALTER TABLE public."user_sites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_sites_isolation ON public."user_sites";
CREATE POLICY user_sites_isolation ON public."user_sites"
  FOR ALL
  TO ecolpro_app
  USING (
      site_matches("siteId")
  )
  WITH CHECK (
      site_matches("siteId")
  );

-- UserTenant
ALTER TABLE public."user_tenants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_tenants_isolation ON public."user_tenants";
CREATE POLICY user_tenants_isolation ON public."user_tenants"
  FOR ALL
  TO ecolpro_app
  USING (
      tenant_matches("tenantId")
  )
  WITH CHECK (
      tenant_matches("tenantId")
  );

-- User
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_isolation ON public."users";
CREATE POLICY users_isolation ON public."users"
  FOR ALL
  TO ecolpro_app
  USING (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  )
  WITH CHECK (
      ("tenantId" IS NULL OR tenant_matches("tenantId"))
      AND site_matches("siteId")
  );

-- _CompetencePrerequis (table de liaison implicite)
-- Prérequis entre compétences (many-to-many implicite). Rattachée par sa
-- colonne "A" : si la compétence source est visible, le lien l'est aussi.
ALTER TABLE public."_CompetencePrerequis" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS CompetencePrerequis_isolation ON public."_CompetencePrerequis";
CREATE POLICY CompetencePrerequis_isolation ON public."_CompetencePrerequis"
  FOR ALL
  TO ecolpro_app
  USING (
      EXISTS (
        SELECT 1 FROM public.learnos_competences c
        WHERE c.id = "A"
          AND (c."tenantId" IS NULL OR tenant_matches(c."tenantId"))
      )
  )
  WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learnos_competences c
        WHERE c.id = "A"
          AND (c."tenantId" IS NULL OR tenant_matches(c."tenantId"))
      )
  );

COMMIT;
