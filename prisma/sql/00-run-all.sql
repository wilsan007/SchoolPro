-- ============================================================
-- 00-run-all.sql
-- Orchestrateur — Cité Scolaire Ambouli (Djibouti)
-- ============================================================
--
-- ⚠️  SUPABASE SQL EDITOR ne supporte PAS les méta-commandes \i ou \echo.
--
-- 👉 EXÉCUTEZ chaque fichier individuellement dans l'ordre :
--    01-tenant-sites-structures.sql
--    02-annees-periodes-calendrier.sql
--    03-matieres-salles-tarifs.sql
--    04-users-staff-enseignants.sql
--    05-classes-eleves-parents.sql
--    06-edt-evaluations-notes-bulletins.sql
--    07-facturation-paiements-relances.sql
--    08-vie-scolaire-sante.sql
--    09-rh-communication-gouvernance-divers.sql
--    10-learnos-curriculum.sql
--    11-learnos-apprentissage.sql
--    12-learnos-exercices.sql
--    13-learnos-intelligence.sql
--
-- 👉 PUIS exécutez ce fichier pour vérifier les comptes.
--
-- 👉 PSQL (terminal) : psql "URL" -f prisma/sql/00-run-all.sql
--    (les \i sont supportés par psql mais pas par Supabase)
-- ============================================================

-- ============================================================
-- Vérification — comptage des enregistrements par table
-- ============================================================

SELECT '--- STRUCTURE & RÉFÉRENCE ---' AS section;

SELECT 'tenants'              AS table_name, count(*) AS rows FROM tenants
UNION ALL SELECT 'sites',               count(*) FROM sites
UNION ALL SELECT 'structures',          count(*) FROM structures
UNION ALL SELECT 'annees_scolaires',    count(*) FROM annees_scolaires
UNION ALL SELECT 'periodes',            count(*) FROM periodes
UNION ALL SELECT 'evenements_calendaires', count(*) FROM evenements_calendaires
UNION ALL SELECT 'matieres',            count(*) FROM matieres
UNION ALL SELECT 'salles',              count(*) FROM salles
UNION ALL SELECT 'tarifs_niveau',       count(*) FROM tarifs_niveau
UNION ALL SELECT 'sync_configs',        count(*) FROM sync_configs
ORDER BY table_name;

SELECT '--- UTILISATEURS & STAFF ---' AS section;

SELECT 'users'               AS table_name, count(*) AS rows FROM users
UNION ALL SELECT 'user_sites',           count(*) FROM user_sites
UNION ALL SELECT 'enseignants',          count(*) FROM enseignants
UNION ALL SELECT 'enseignant_sites',     count(*) FROM enseignant_sites
UNION ALL SELECT 'fiches_rh',            count(*) FROM fiches_rh
UNION ALL SELECT 'bulletins_paie',       count(*) FROM bulletins_paie
ORDER BY table_name;

SELECT '--- CLASSES, ÉLÈVES, PARENTS ---' AS section;

SELECT 'classes'             AS table_name, count(*) AS rows FROM classes
UNION ALL SELECT 'eleves',              count(*) FROM eleves
UNION ALL SELECT 'parents',             count(*) FROM parents
UNION ALL SELECT 'eleve_parents',       count(*) FROM eleve_parents
UNION ALL SELECT 'parcours_scolaires',  count(*) FROM parcours_scolaires
UNION ALL SELECT 'historique_classes',  count(*) FROM historique_classes
UNION ALL SELECT 'alumni',              count(*) FROM alumni
ORDER BY table_name;

SELECT '--- PÉDAGOGIE ---' AS section;

SELECT 'emplois_temps'       AS table_name, count(*) AS rows FROM emplois_temps
UNION ALL SELECT 'evaluations',         count(*) FROM evaluations
UNION ALL SELECT 'notes',               count(*) FROM notes
UNION ALL SELECT 'bulletins',           count(*) FROM bulletins
UNION ALL SELECT 'bulletin_matieres',   count(*) FROM bulletin_matieres
ORDER BY table_name;

SELECT '--- FACTURATION ---' AS section;

SELECT 'factures'            AS table_name, count(*) AS rows FROM factures
UNION ALL SELECT 'echeanciers',          count(*) FROM echeanciers
UNION ALL SELECT 'echeances_paiement',   count(*) FROM echeances_paiement
UNION ALL SELECT 'paiements',            count(*) FROM paiements
UNION ALL SELECT 'relances',             count(*) FROM relances
UNION ALL SELECT 'exclusions_eleve',     count(*) FROM exclusions_eleve
ORDER BY table_name;

SELECT '--- VIE SCOLAIRE & SANTÉ ---' AS section;

SELECT 'absences'            AS table_name, count(*) AS rows FROM absences
UNION ALL SELECT 'incidents',            count(*) FROM incidents
UNION ALL SELECT 'sanctions',            count(*) FROM sanctions
UNION ALL SELECT 'passages_infirmerie',  count(*) FROM passages_infirmerie
UNION ALL SELECT 'fiches_sanitaires',    count(*) FROM fiches_sanitaires
UNION ALL SELECT 'entretiens_conseiller', count(*) FROM entretiens_conseiller
UNION ALL SELECT 'dispenses_matiere',    count(*) FROM dispenses_matiere
ORDER BY table_name;

SELECT '--- RH, COMMUNICATION, GOUVERNANCE ---' AS section;

SELECT 'absences_personnel'  AS table_name, count(*) AS rows FROM absences_personnel
UNION ALL SELECT 'conges_personnel',      count(*) FROM conges_personnel
UNION ALL SELECT 'remplacements_cours',   count(*) FROM remplacements_cours
UNION ALL SELECT 'notifications',         count(*) FROM notifications
UNION ALL SELECT 'conversations',         count(*) FROM conversations
UNION ALL SELECT 'messages',              count(*) FROM messages
UNION ALL SELECT 'conseils',              count(*) FROM conseils
UNION ALL SELECT 'reunions',              count(*) FROM reunions
UNION ALL SELECT 'resolutions',           count(*) FROM resolutions
UNION ALL SELECT 'mentorats',             count(*) FROM mentorats
UNION ALL SELECT 'candidatures',          count(*) FROM candidatures
UNION ALL SELECT 'inventaire',            count(*) FROM inventaire
UNION ALL SELECT 'budgets',               count(*) FROM budgets
UNION ALL SELECT 'depenses',              count(*) FROM depenses
UNION ALL SELECT 'taches',                count(*) FROM taches
ORDER BY table_name;

SELECT '--- LEARNOS : CURRICULUM ---' AS section;

SELECT 'learnos_chapitres'   AS table_name, count(*) AS rows FROM learnos_chapitres
UNION ALL SELECT 'learnos_competences',   count(*) FROM learnos_competences
UNION ALL SELECT 'learnos_planification_chapitres', count(*) FROM learnos_planification_chapitres
UNION ALL SELECT 'learnos_seuils_recommandation', count(*) FROM learnos_seuils_recommandation
UNION ALL SELECT 'learnos_calibration_seuils', count(*) FROM learnos_calibration_seuils
UNION ALL SELECT 'learnos_evaluation_competences', count(*) FROM learnos_evaluation_competences
ORDER BY table_name;

SELECT '--- LEARNOS : APPRENTISSAGE & EXERCICES ---' AS section;

SELECT 'learnos_learning_evidences' AS table_name, count(*) AS rows FROM learnos_learning_evidences
UNION ALL SELECT 'learnos_student_learning_profiles', count(*) FROM learnos_student_learning_profiles
UNION ALL SELECT 'learnos_recommandations', count(*) FROM learnos_recommandations
UNION ALL SELECT 'learnos_student_interventions', count(*) FROM learnos_student_interventions
UNION ALL SELECT 'learnos_plans_progression', count(*) FROM learnos_plans_progression
UNION ALL SELECT 'learnos_etapes_plan', count(*) FROM learnos_etapes_plan
UNION ALL SELECT 'learnos_questions', count(*) FROM learnos_questions
UNION ALL SELECT 'learnos_feuilles_exercices', count(*) FROM learnos_feuilles_exercices
UNION ALL SELECT 'learnos_exercices_assignes', count(*) FROM learnos_exercices_assignes
UNION ALL SELECT 'learnos_exercices_reponses', count(*) FROM learnos_exercices_reponses
ORDER BY table_name;

SELECT '--- LEARNOS : INTELLIGENCE PÉDAGOGIQUE ---' AS section;

SELECT 'learnos_patterns_pedago' AS table_name, count(*) AS rows FROM learnos_patterns_pedago
UNION ALL SELECT 'learnos_predictions', count(*) FROM learnos_predictions
UNION ALL SELECT 'learnos_journal_apprentissage', count(*) FROM learnos_journal_apprentissage
UNION ALL SELECT 'learnos_kpi_snapshots', count(*) FROM learnos_kpi_snapshots
UNION ALL SELECT 'learnos_alertes_parent', count(*) FROM learnos_alertes_parent
UNION ALL SELECT 'learnos_echanges_parent', count(*) FROM learnos_echanges_parent
UNION ALL SELECT 'learnos_plans_lecon', count(*) FROM learnos_plans_lecon
UNION ALL SELECT 'learnos_rubriques_evaluation', count(*) FROM learnos_rubriques_evaluation
UNION ALL SELECT 'learnos_ai_decision_logs', count(*) FROM learnos_ai_decision_logs
UNION ALL SELECT 'learnos_ai_cache', count(*) FROM learnos_ai_cache
ORDER BY table_name;

-- SEED Cité Scolaire Ambouli — Terminé
