-- 14-admin-multi-roles-parent-demo.sql
-- Cité Scolaire Ambouli — Multi-rôles pour le tenant-admin + compte parent de démonstration
--
-- Objectif: permettre au tenant-admin (user-admin-amb) de:
-- 1. Posséder TOUS les rôles dans le tenant (switcher de rôle via le dropdown)
-- 2. Être parent de plusieurs enfants aux profils pédagogiques variés
-- 3. Démontrer toutes les comparaisons possibles (inter-sites, inter-années)
--
-- Enfants du parent admin (profils variés):
--   - ele-ambouli-2024-0038 : Élève FORT (moyenne ~18/20) — en avance
--   - ele-ambouli-2024-0001 : Élève FAIBLE (moyenne ~6/20) — en difficulté qui a progressé
--   - ele-ambouli-2024-0011 : Élève TRÈS FAIBLE (moyenne ~5/20) — n'a pas progressé
--   - ele-ambouli-2025-0060 : Élève FORT année 2 (moyenne ~17.5/20) — comparaison inter-année
--   - ele-ambouli-2025-0001 : Élève MOYEN année 2 — évolution différente
--   - ele-arhiba-2024-0001  : Élève site ARHIBA — comparaison inter-sites
--   - ele-ambouli-2024-0001 : EXCLU pour non-paiement (exclusion active)

-- ─── Nettoyage ───────────────────────────────────────────────
DELETE FROM "eleve_parents" WHERE "parentId" = 'parent-admin-amb';
DELETE FROM "parents" WHERE "id" = 'parent-admin-amb';
DELETE FROM "user_roles" WHERE "userId" = 'user-admin-amb' AND "tenantId" = 'tenant-ambouli';
DELETE FROM "user_sites" WHERE "userId" = 'user-admin-amb';

-- ─── 1. UserSite: admin rattaché aux deux sites ──────────────
INSERT INTO "user_sites" ("id", "userId", "siteId", "role", "createdAt", "updatedAt") VALUES
  ('us-admin-amb-1', 'user-admin-amb', 'site-ambouli', 'TENANT_ADMIN', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('us-admin-amb-2', 'user-admin-amb', 'site-arhiba', 'TENANT_ADMIN', '2024-09-01 00:00:00', '2024-09-01 00:00:00')
ON CONFLICT ("userId", "siteId") DO NOTHING;

-- ─── 2. UserRole: tous les rôles pour le tenant-admin ────────
-- Cela permet au RoleSwitcher d'afficher tous les rôles dans le dropdown
INSERT INTO "user_roles" ("id", "userId", "tenantId", "role", "isActive", "createdAt", "updatedAt") VALUES
  ('ur-admin-01', 'user-admin-amb', 'tenant-ambouli', 'TENANT_ADMIN',  TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-02', 'user-admin-amb', 'tenant-ambouli', 'PRINCIPAL',     TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-03', 'user-admin-amb', 'tenant-ambouli', 'SECRETARY',     TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-04', 'user-admin-amb', 'tenant-ambouli', 'TEACHER',       TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-05', 'user-admin-amb', 'tenant-ambouli', 'CLASS_TEACHER', TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-06', 'user-admin-amb', 'tenant-ambouli', 'COUNSELOR',     TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-07', 'user-admin-amb', 'tenant-ambouli', 'NURSE',         TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-08', 'user-admin-amb', 'tenant-ambouli', 'ACCOUNTANT',    TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-09', 'user-admin-amb', 'tenant-ambouli', 'SUPERVISOR',    TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-10', 'user-admin-amb', 'tenant-ambouli', 'SUBJECT_LEAD',  TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-11', 'user-admin-amb', 'tenant-ambouli', 'SITE_MANAGER',  TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-12', 'user-admin-amb', 'tenant-ambouli', 'INSPECTOR',     TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-13', 'user-admin-amb', 'tenant-ambouli', 'PARENT',        TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('ur-admin-14', 'user-admin-amb', 'tenant-ambouli', 'STUDENT',       TRUE, '2024-09-01 00:00:00', '2024-09-01 00:00:00')
ON CONFLICT ("userId", "tenantId", "role") DO NOTHING;

-- ─── 3. Parent record for the admin ──────────────────────────
-- Le tenant-admin devient aussi parent pour démontrer le portail parent
INSERT INTO "parents" ("id", "tenantId", "userId", "nom", "prenom", "email", "phone", "phone2", "profession", "adresse", "photoUrl", "createdAt", "updatedAt") VALUES
  ('parent-admin-amb', 'tenant-ambouli', 'user-admin-amb', 'Mahamoud', 'Abdillahi', 'admin@cite-ambouli.dj', '+253 77 10 00 00', '+253 77 20 00 00', 'Directeur', 'Quartier Ambouli, Djibouti', NULL, '2024-09-01 00:00:00', '2024-09-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- ─── 4. EleveParent: link admin parent to multiple children ──
-- Profils variés pour démonstration:
--   Enfant 1: FORT (moyenne ~18) — en avance
--   Enfant 2: FAIBLE qui a PROGRESSÉ (moyenne ~6 en 2024, mieux en 2025)
--   Enfant 3: TRÈS FAIBLE qui n'a PAS progressé (moyenne ~5)
--   Enfant 4: FORT année 2 (comparaison inter-année)
--   Enfant 5: MOYEN année 2 (évolution différente)
--   Enfant 6: Site ARHIBA (comparaison inter-sites)
--   Enfant 7: EXCLU pour non-paiement

INSERT INTO "eleve_parents" ("eleveId", "parentId", "lien", "isGardien") VALUES
  ('ele-ambouli-2024-0038', 'parent-admin-amb', 'PERE', TRUE),   -- FORT: moyenne ~18
  ('ele-ambouli-2024-0001', 'parent-admin-amb', 'PERE', TRUE),   -- FAIBLE + EXCLU: moyenne ~6
  ('ele-ambouli-2024-0011', 'parent-admin-amb', 'PERE', TRUE),   -- TRÈS FAIBLE: moyenne ~5
  ('ele-ambouli-2025-0060', 'parent-admin-amb', 'PERE', TRUE),   -- FORT année 2
  ('ele-ambouli-2025-0001', 'parent-admin-amb', 'PERE', TRUE),   -- MOYEN année 2
  ('ele-arhiba-2024-0001',  'parent-admin-amb', 'TUTEUR', TRUE), -- Site ARHIBA
  ('ele-ambouli-2025-0011', 'parent-admin-amb', 'PERE', TRUE)    -- Élève moyen année 2 (évolution différente)
ON CONFLICT ("eleveId", "parentId") DO NOTHING;

-- ─── 5. Exclusion active pour ele-ambouli-2024-0001 ──────────
-- Cet élève est déjà exclu dans les données 07, mais on s'assure qu'il a une exclusion ACTIVE
-- pour démontrer le portail parent avec un enfant exclu
INSERT INTO "exclusions_eleve" ("id", "tenantId", "eleveId", "motif", "details", "dateDebut", "dateFin", "leveeParId", "leveeLe", "decideeParId", "createdAt") VALUES
  ('excl-admin-demo-1', 'tenant-ambouli', 'ele-ambouli-2024-0001', 'NON_PAIEMENT_REPETE', 'Factures impayées malgré relances - démo parent admin', '2025-03-01 00:00:00', NULL, NULL, NULL, 'user-admin-amb', '2025-03-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- ─── 6. Préférences parent LEARNOS pour le parent admin ──────
INSERT INTO "learnos_preferences_parent" ("id", "tenantId", "parentId", "langue", "alertesActives", "niveauMinimal", "plafondHebdomadaire", "createdAt", "updatedAt") VALUES
  ('pref-parent-admin-amb', 'tenant-ambouli', 'parent-admin-amb', 'fr', TRUE, 'INFO', 5, '2024-09-01 00:00:00', '2024-09-01 00:00:00')
ON CONFLICT ("parentId") DO NOTHING;

-- ─── 7. Alertes parent pour démontrer le bot parent ──────────
INSERT INTO "learnos_alertes_parent" ("id", "tenantId", "siteId", "eleveId", "parentId", "niveau", "cle", "params", "canal", "statut", "motifSuppression", "envoyeeLe", "erreur", "empreinte", "createdAt", "updatedAt") VALUES
  ('alp-admin-1', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0001', 'parent-admin-amb', 'URGENT', 'learnos.alertes.difficulte', '{"competence":"comp-MATH-6eme-1-1"}'::jsonb, 'whatsapp', 'ENVOYEE', NULL, '2025-01-15 00:00:00', NULL, 'empreinte-admin-1', '2025-01-15 00:00:00', '2025-01-15 00:00:00'),
  ('alp-admin-2', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0038', 'parent-admin-amb', 'INFO', 'learnos.alertes.progression', '{"competence":"comp-MATH-6eme-1-1"}'::jsonb, 'whatsapp', 'ENVOYEE', NULL, '2025-02-01 00:00:00', NULL, 'empreinte-admin-2', '2025-02-01 00:00:00', '2025-02-01 00:00:00'),
  ('alp-admin-3', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0011', 'parent-admin-amb', 'ATTENTION', 'learnos.alertes.difficulte', '{"competence":"comp-FR-6eme-1-1"}'::jsonb, 'sms', 'ENVOYEE', NULL, '2025-02-15 00:00:00', NULL, 'empreinte-admin-3', '2025-02-15 00:00:00', '2025-02-15 00:00:00'),
  ('alp-admin-4', 'tenant-ambouli', 'site-arhiba', 'ele-arhiba-2024-0001', 'parent-admin-amb', 'INFO', 'learnos.alertes.assiduite', '{"competence":"comp-ANG-6eme-1-1"}'::jsonb, 'email', 'ENVOYEE', NULL, '2025-03-01 00:00:00', NULL, 'empreinte-admin-4', '2025-03-01 00:00:00', '2025-03-01 00:00:00')
ON CONFLICT ("empreinte") DO NOTHING;

-- ─── 8. Échanges parent pour démontrer le bot parent ─────────
INSERT INTO "learnos_echanges_parent" ("id", "tenantId", "siteId", "parentId", "eleveId", "canal", "question", "intention", "reponse", "modele", "createdAt") VALUES
  ('ech-admin-1', 'tenant-ambouli', 'site-ambouli', 'parent-admin-amb', 'ele-ambouli-2024-0001', 'whatsapp', 'Comment va mon enfant en mathématiques ?', 'difficultes', 'Votre enfant rencontre des difficultés en mathématiques (moyenne: 5.9/20). Un plan de remédiation a été mis en place.', null, '2025-01-20 00:00:00'),
  ('ech-admin-2', 'tenant-ambouli', 'site-ambouli', 'parent-admin-amb', 'ele-ambouli-2024-0038', 'whatsapp', 'Comment va mon enfant en mathématiques ?', 'progression', 'Votre enfant excelle en mathématiques (moyenne: 18.3/20). Continuez à l''encourager !', null, '2025-02-05 00:00:00'),
  ('ech-admin-3', 'tenant-ambouli', 'site-ambouli', 'parent-admin-amb', 'ele-ambouli-2024-0011', 'whatsapp', 'Pourquoi mon enfant a-t-il des difficultés ?', 'difficultes', 'Votre enfant a des difficultés persistantes. Une rencontre avec le conseiller d''orientation est recommandée.', null, '2025-02-20 00:00:00'),
  ('ech-admin-4', 'tenant-ambouli', 'site-arhiba', 'parent-admin-amb', 'ele-arhiba-2024-0001', 'whatsapp', 'Comment va mon enfant ?', 'progression', 'Votre enfant progresse bien sur le site Arhiba. Moyenne générale correcte.', null, '2025-03-05 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- ─── 9. LEARNOS: profils et prédictions pour les enfants admin ─
-- Pour démontrer les comparaisons inter-années et inter-sites

-- Profils d'apprentissage pour les enfants admin (différents niveaux de maîtrise)
INSERT INTO "learnos_student_learning_profiles" ("id", "tenantId", "siteId", "eleveId", "competenceId", "masteryScore", "confidenceScore", "masteryStatus", "evidenceCount", "lastEvidenceAt", "trend", "errorPatterns", "prerequisiteStatus", "recommendedAction", "computedAt", "updatedAt") VALUES
  -- Enfant FORT: maîtrise élevée
  ('slp-admin-1', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0038', 'comp-MATH-6eme-1-1', 0.92, 0.95, 'MASTERED', 8, '2024-12-15 00:00:00', 'hausse', NULL, NULL, NULL, '2024-12-15 00:00:00', '2024-12-15 00:00:00'),
  ('slp-admin-2', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0038', 'comp-FR-6eme-1-1', 0.88, 0.90, 'PROFICIENT', 6, '2024-12-15 00:00:00', 'stable', NULL, NULL, NULL, '2024-12-15 00:00:00', '2024-12-15 00:00:00'),
  -- Enfant FAIBLE qui progresse
  ('slp-admin-3', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0001', 'comp-MATH-6eme-1-1', 0.28, 0.70, 'EMERGING', 5, '2024-12-15 00:00:00', 'hausse', '{"type":"CALCULATION_ERROR"}'::jsonb, NULL, 'remediation', '2024-12-15 00:00:00', '2024-12-15 00:00:00'),
  ('slp-admin-4', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0001', 'comp-FR-6eme-1-1', 0.32, 0.65, 'EMERGING', 4, '2024-12-15 00:00:00', 'hausse', '{"type":"CONCEPTUAL_ERROR"}'::jsonb, NULL, 'remediation', '2024-12-15 00:00:00', '2024-12-15 00:00:00'),
  -- Enfant TRÈS FAIBLE qui ne progresse pas
  ('slp-admin-5', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0011', 'comp-MATH-6eme-1-1', 0.15, 0.60, 'EMERGING', 5, '2024-12-15 00:00:00', 'baisse', '{"type":"PROCEDURAL_ERROR"}'::jsonb, '{"status":"BLOQUE"}'::jsonb, 'plan_critique', '2024-12-15 00:00:00', '2024-12-15 00:00:00'),
  ('slp-admin-6', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0011', 'comp-FR-6eme-1-1', 0.18, 0.55, 'EMERGING', 4, '2024-12-15 00:00:00', 'baisse', '{"type":"CONCEPTUAL_ERROR"}'::jsonb, '{"status":"BLOQUE"}'::jsonb, 'plan_critique', '2024-12-15 00:00:00', '2024-12-15 00:00:00'),
  -- Enfant FORT année 2
  ('slp-admin-7', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2025-0060', 'comp-MATH-6eme-1-1', 0.90, 0.92, 'MASTERED', 6, '2025-06-15 00:00:00', 'stable', NULL, NULL, NULL, '2025-06-15 00:00:00', '2025-06-15 00:00:00'),
  -- Enfant MOYEN année 2
  ('slp-admin-8', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2025-0001', 'comp-MATH-6eme-1-1', 0.55, 0.75, 'DEVELOPING', 5, '2025-06-15 00:00:00', 'hausse', NULL, NULL, 'consolidation', '2025-06-15 00:00:00', '2025-06-15 00:00:00'),
  -- Enfant site ARHIBA
  ('slp-admin-9', 'tenant-ambouli', 'site-arhiba', 'ele-arhiba-2024-0001', 'comp-MATH-6eme-1-1', 0.62, 0.78, 'PROFICIENT', 5, '2024-12-15 00:00:00', 'stable', NULL, NULL, NULL, '2024-12-15 00:00:00', '2024-12-15 00:00:00')
ON CONFLICT ("eleveId", "competenceId") DO UPDATE SET
  "masteryScore" = EXCLUDED."masteryScore",
  "confidenceScore" = EXCLUDED."confidenceScore",
  "masteryStatus" = EXCLUDED."masteryStatus",
  "evidenceCount" = EXCLUDED."evidenceCount",
  "lastEvidenceAt" = EXCLUDED."lastEvidenceAt",
  "trend" = EXCLUDED."trend",
  "errorPatterns" = EXCLUDED."errorPatterns",
  "prerequisiteStatus" = EXCLUDED."prerequisiteStatus",
  "recommendedAction" = EXCLUDED."recommendedAction",
  "computedAt" = EXCLUDED."computedAt",
  "updatedAt" = EXCLUDED."updatedAt";

-- Prédictions pour comparer l'évolution
INSERT INTO "learnos_predictions" ("id", "tenantId", "siteId", "eleveId", "competenceId", "chapitreId", "anneeId", "probaReussite", "difficultePredite", "masteryAvant", "confidenceAvant", "prerequisManquants", "masteryApres", "predictionCorrecte", "ecart", "emiseLe", "verifieeLe") VALUES
  -- Enfant FORT: prédiction facile, vérifiée correcte
  ('pred-admin-1', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0038', 'comp-MATH-6eme-1-1', 'chap-MATH-6eme-1', 'annee-2024-amb', 0.92, 'FACILE', 0.88, 0.90, 0, 0.92, TRUE, 0.04, '2024-09-01 00:00:00', '2025-01-15 00:00:00'),
  -- Enfant FAIBLE: prédiction critique, amélioration inattendue
  ('pred-admin-2', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0001', 'comp-MATH-6eme-1-1', 'chap-MATH-6eme-1', 'annee-2024-amb', 0.25, 'CRITIQUE', 0.20, 0.65, 2, 0.28, FALSE, 0.03, '2024-09-01 00:00:00', '2025-01-15 00:00:00'),
  -- Enfant TRÈS FAIBLE: prédiction critique, confirmée
  ('pred-admin-3', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0011', 'comp-MATH-6eme-1-1', 'chap-MATH-6eme-1', 'annee-2024-amb', 0.12, 'CRITIQUE', 0.15, 0.60, 3, 0.15, TRUE, 0.03, '2024-09-01 00:00:00', '2025-01-15 00:00:00'),
  -- Enfant FORT année 2: prédiction facile
  ('pred-admin-4', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2025-0060', 'comp-MATH-6eme-1-1', 'chap-MATH-6eme-1', 'annee-2025-amb', 0.90, 'FACILE', 0.85, 0.88, 0, 0.90, TRUE, 0.05, '2025-09-01 00:00:00', '2025-12-15 00:00:00'),
  -- Enfant MOYEN année 2: prédiction modérée
  ('pred-admin-5', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2025-0001', 'comp-MATH-6eme-1-1', 'chap-MATH-6eme-1', 'annee-2025-amb', 0.55, 'MODERE', 0.50, 0.72, 1, 0.55, TRUE, 0.05, '2025-09-01 00:00:00', '2025-12-15 00:00:00'),
  -- Enfant ARHIBA: prédiction modérée
  ('pred-admin-6', 'tenant-ambouli', 'site-arhiba', 'ele-arhiba-2024-0001', 'comp-MATH-6eme-1-1', 'chap-MATH-6eme-1', 'annee-2024-amb', 0.60, 'MODERE', 0.55, 0.75, 1, 0.62, TRUE, 0.02, '2024-09-01 00:00:00', '2025-01-15 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Recommandations pour les enfants admin
INSERT INTO "learnos_recommandations" ("id", "tenantId", "siteId", "eleveId", "competenceId", "niveau", "statut", "motif", "regleDeclenchee", "actionProposee", "prerequisManquants", "competencesBloquees", "decideParId", "decideeLe", "resolueLe", "createdAt", "updatedAt", "motifParams") VALUES
  -- Enfant FAIBLE: recommandation critique (résolue = a progressé)
  ('rec-admin-1', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0001', 'comp-MATH-6eme-1-1', 'CRITIQUE', 'ACCEPTEE', 'Maîtrise insuffisante', 'seuil_critique', 'Séance de remédiation + exercices adaptés', NULL, 2, 'user-admin-amb', '2024-10-15 00:00:00', '2025-01-15 00:00:00', '2024-10-15 00:00:00', '2025-01-15 00:00:00', NULL),
  -- Enfant TRÈS FAIBLE: recommandation critique (non résolue)
  ('rec-admin-2', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0011', 'comp-MATH-6eme-1-1', 'CRITIQUE', 'OBLIGATOIRE', 'Maîtrise très insuffisante', 'seuil_critique', 'Plan de remédiation urgent + soutien individuel', NULL, 3, 'user-admin-amb', '2024-10-15 00:00:00', NULL, '2024-10-15 00:00:00', '2024-10-15 00:00:00', NULL),
  -- Enfant FORT: recommandation avancé
  ('rec-admin-3', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0038', 'comp-MATH-6eme-1-1', 'AVANCE', 'PROPOSEE', 'Élève en avance', 'seuil_avance', 'Exercices d''approfondissement + projet personnel', NULL, 0, NULL, NULL, NULL, '2025-01-15 00:00:00', '2025-01-15 00:00:00', NULL),
  -- Enfant MOYEN année 2: recommandation consolidation
  ('rec-admin-4', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2025-0001', 'comp-MATH-6eme-1-1', 'FRAGILE', 'RECOMMANDEE', 'Maîtrise fragile', 'seuil_fragile', 'Exercices de consolidation', NULL, 1, NULL, NULL, NULL, '2025-10-15 00:00:00', '2025-10-15 00:00:00', NULL)
ON CONFLICT ("eleveId", "competenceId") DO UPDATE SET
  "niveau" = EXCLUDED."niveau",
  "statut" = EXCLUDED."statut",
  "motif" = EXCLUDED."motif",
  "actionProposee" = EXCLUDED."actionProposee",
  "decideParId" = EXCLUDED."decideParId",
  "decideeLe" = EXCLUDED."decideeLe",
  "resolueLe" = EXCLUDED."resolueLe",
  "updatedAt" = EXCLUDED."updatedAt";
-- Exercices d'entraînement pour les enfants admin (année 1 vs année 2)
INSERT INTO "learnos_feuilles_exercices" ("id", "tenantId", "siteId", "eleveId", "matiereId", "type", "statut", "etapePlanId", "valideParId", "valideeLe", "assigneeLe", "termineeLe", "createdAt", "updatedAt", "competenceAttesteeId") VALUES
  -- Enfant FORT: exercices avancés
  ('feuille-admin-1', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0038', 'mat-MATH', 'entrainement', 'TERMINEE', NULL, NULL, NULL, '2024-10-15 00:00:00', '2024-10-20 00:00:00', '2024-10-15 00:00:00', '2024-10-20 00:00:00', 'comp-MATH-6eme-1-1'),
  ('feuille-admin-2', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0038', 'mat-MATH', 'approfondissement', 'TERMINEE', NULL, NULL, NULL, '2024-11-15 00:00:00', '2024-11-20 00:00:00', '2024-11-15 00:00:00', '2024-11-20 00:00:00', 'comp-MATH-6eme-1-1'),
  -- Enfant FAIBLE: exercices de soutien (progression visible)
  ('feuille-admin-3', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0001', 'mat-MATH', 'soutien', 'TERMINEE', NULL, NULL, NULL, '2024-10-15 00:00:00', '2024-10-25 00:00:00', '2024-10-15 00:00:00', '2024-10-25 00:00:00', 'comp-MATH-6eme-1-1'),
  ('feuille-admin-4', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0001', 'mat-MATH', 'soutien', 'TERMINEE', NULL, NULL, NULL, '2024-11-15 00:00:00', '2024-11-22 00:00:00', '2024-11-15 00:00:00', '2024-11-22 00:00:00', 'comp-MATH-6eme-1-1'),
  -- Enfant TRÈS FAIBLE: exercices de soutien (pas de progression)
  ('feuille-admin-5', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2024-0011', 'mat-MATH', 'soutien', 'EN_COURS', NULL, NULL, NULL, '2024-10-15 00:00:00', NULL, '2024-10-15 00:00:00', '2024-10-15 00:00:00', 'comp-MATH-6eme-1-1'),
  -- Enfant FORT année 2
  ('feuille-admin-6', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2025-0060', 'mat-MATH', 'entrainement', 'TERMINEE', NULL, NULL, NULL, '2025-10-15 00:00:00', '2025-10-20 00:00:00', '2025-10-15 00:00:00', '2025-10-20 00:00:00', 'comp-MATH-6eme-1-1'),
  -- Enfant MOYEN année 2
  ('feuille-admin-7', 'tenant-ambouli', 'site-ambouli', 'ele-ambouli-2025-0001', 'mat-MATH', 'entrainement', 'TERMINEE', NULL, NULL, NULL, '2025-10-15 00:00:00', '2025-10-25 00:00:00', '2025-10-15 00:00:00', '2025-10-25 00:00:00', 'comp-MATH-6eme-1-1'),
  -- Enfant ARHIBA
  ('feuille-admin-8', 'tenant-ambouli', 'site-arhiba', 'ele-arhiba-2024-0001', 'mat-MATH', 'entrainement', 'TERMINEE', NULL, NULL, NULL, '2024-10-15 00:00:00', '2024-10-22 00:00:00', '2024-10-15 00:00:00', '2024-10-22 00:00:00', 'comp-MATH-6eme-1-1')
ON CONFLICT ("id") DO NOTHING;

-- Exercices assignés + réponses pour comparer les scores
INSERT INTO "learnos_exercices_assignes" ("id", "feuilleId", "questionId", "competenceId", "competenceViseeId", "ordre", "palier", "regleDeclenchee", "motifParams", "priorite", "createdAt") VALUES
  -- Enfant FORT: exercices avancés (bons scores)
  ('ex-admin-1', 'feuille-admin-1', 'q-1', 'comp-MATH-6eme-1-1', NULL, 1, 'CONSOLIDATION', 'exercice_standard', NULL, 1, '2024-10-15 00:00:00'),
  ('ex-admin-2', 'feuille-admin-1', 'q-2', 'comp-MATH-6eme-1-1', NULL, 2, 'TRANSFERT', 'exercice_standard', NULL, 2, '2024-10-15 00:00:00'),
  -- Enfant FAIBLE: exercices soutien (scores faibles puis meilleurs)
  ('ex-admin-3', 'feuille-admin-3', 'q-1', 'comp-MATH-6eme-1-1', NULL, 1, 'RESTITUTION', 'exercice_soutien', NULL, 1, '2024-10-15 00:00:00'),
  ('ex-admin-4', 'feuille-admin-3', 'q-2', 'comp-MATH-6eme-1-1', NULL, 2, 'APPLICATION', 'exercice_soutien', NULL, 2, '2024-10-15 00:00:00'),
  ('ex-admin-5', 'feuille-admin-4', 'q-3', 'comp-MATH-6eme-1-1', NULL, 1, 'RESTITUTION', 'exercice_soutien', NULL, 1, '2024-11-15 00:00:00'),
  -- Enfant TRÈS FAIBLE: exercices soutien (scores très faibles)
  ('ex-admin-6', 'feuille-admin-5', 'q-1', 'comp-MATH-6eme-1-1', NULL, 1, 'RESTITUTION', 'exercice_soutien', NULL, 1, '2024-10-15 00:00:00'),
  -- Enfant FORT année 2
  ('ex-admin-7', 'feuille-admin-6', 'q-1', 'comp-MATH-6eme-1-1', NULL, 1, 'CONSOLIDATION', 'exercice_standard', NULL, 1, '2025-10-15 00:00:00'),
  -- Enfant MOYEN année 2
  ('ex-admin-8', 'feuille-admin-7', 'q-1', 'comp-MATH-6eme-1-1', NULL, 1, 'APPLICATION', 'exercice_standard', NULL, 1, '2025-10-15 00:00:00'),
  -- Enfant ARHIBA
  ('ex-admin-9', 'feuille-admin-8', 'q-1', 'comp-MATH-6eme-1-1', NULL, 1, 'APPLICATION', 'exercice_standard', NULL, 1, '2024-10-15 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Réponses avec scores variés pour comparer l'évolution
INSERT INTO "learnos_exercices_reponses" ("id", "exerciceAssigneId", "reponse", "score", "maxScore", "corrigeParId", "corrigeeLe", "evidenceId", "repondueLe", "updatedAt", "dureeMs", "etapes", "tentatives") VALUES
  -- Enfant FORT: bonnes réponses
  ('rep-admin-1', 'ex-admin-1', 'A', 1, 1, NULL, NULL, NULL, '2024-10-18 00:00:00', '2024-10-18 00:00:00', 45000, NULL, 1),
  ('rep-admin-2', 'ex-admin-2', 'B', 1, 1, NULL, NULL, NULL, '2024-10-19 00:00:00', '2024-10-19 00:00:00', 60000, NULL, 1),
  -- Enfant FAIBLE: progression visible (échec puis succès)
  ('rep-admin-3', 'ex-admin-3', 'C', 0, 1, NULL, NULL, NULL, '2024-10-20 00:00:00', '2024-10-20 00:00:00', 120000, NULL, 3),
  ('rep-admin-4', 'ex-admin-4', 'A', 0, 1, NULL, NULL, NULL, '2024-10-22 00:00:00', '2024-10-22 00:00:00', 180000, NULL, 4),
  ('rep-admin-5', 'ex-admin-5', 'A', 1, 1, NULL, NULL, NULL, '2024-11-18 00:00:00', '2024-11-18 00:00:00', 90000, NULL, 2),
  -- Enfant TRÈS FAIBLE: pas de progression
  ('rep-admin-6', 'ex-admin-6', 'D', 0, 1, NULL, NULL, NULL, '2024-10-25 00:00:00', '2024-10-25 00:00:00', 240000, NULL, 5),
  -- Enfant FORT année 2
  ('rep-admin-7', 'ex-admin-7', 'A', 1, 1, NULL, NULL, NULL, '2025-10-18 00:00:00', '2025-10-18 00:00:00', 50000, NULL, 1),
  -- Enfant MOYEN année 2
  ('rep-admin-8', 'ex-admin-8', 'A', 1, 1, NULL, NULL, NULL, '2025-10-22 00:00:00', '2025-10-22 00:00:00', 110000, NULL, 2),
  -- Enfant ARHIBA
  ('rep-admin-9', 'ex-admin-9', 'B', 1, 1, NULL, NULL, NULL, '2024-10-20 00:00:00', '2024-10-20 00:00:00', 85000, NULL, 1)
ON CONFLICT ("id") DO NOTHING;

-- ─── 11. KPIs pour comparaisons inter-sites/inter-années ─────
INSERT INTO "learnos_kpi_snapshots" ("id", "tenantId", "siteId", "role", "kpiKey", "valeur", "cible", "periode", "createdAt") VALUES
  -- Comparaison inter-sites (2024-2025)
  ('kpi-admin-1', 'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.maitrise_moyenne', 62.5, 75, '2024-12-01 00:00:00', '2025-01-01 00:00:00'),
  ('kpi-admin-2', 'tenant-ambouli', 'site-arhiba', 'TENANT_ADMIN', 'learnos.kpi.maitrise_moyenne', 58.3, 75, '2024-12-01 00:00:00', '2025-01-01 00:00:00'),
  ('kpi-admin-3', 'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.eleves_critiques', 18, 10, '2024-12-01 00:00:00', '2025-01-01 00:00:00'),
  ('kpi-admin-4', 'tenant-ambouli', 'site-arhiba', 'TENANT_ADMIN', 'learnos.kpi.eleves_critiques', 22, 10, '2024-12-01 00:00:00', '2025-01-01 00:00:00'),
  ('kpi-admin-5', 'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.precision_predictions', 82.0, 85, '2024-12-01 00:00:00', '2025-01-01 00:00:00'),
  ('kpi-admin-6', 'tenant-ambouli', 'site-arhiba', 'TENANT_ADMIN', 'learnos.kpi.precision_predictions', 78.5, 85, '2024-12-01 00:00:00', '2025-01-01 00:00:00'),
  -- Comparaison inter-années (Ambouli 2024 vs 2025) — périodes différentes pour éviter les doublons
  ('kpi-admin-8',  'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.maitrise_moyenne', 68.2, 75, '2025-12-01 00:00:00', '2026-01-01 00:00:00'),
  ('kpi-admin-9',  'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.exercices_completes', 72.0, 80, '2024-12-01 00:00:00', '2025-01-01 00:00:00'),
  ('kpi-admin-10', 'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.exercices_completes', 81.5, 80, '2025-12-01 00:00:00', '2026-01-01 00:00:00'),
  ('kpi-admin-11', 'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.precision_predictions', 82.0, 85, '2024-06-01 00:00:00', '2024-07-01 00:00:00'),
  ('kpi-admin-12', 'tenant-ambouli', 'site-ambouli', 'TENANT_ADMIN', 'learnos.kpi.precision_predictions', 86.3, 85, '2025-12-01 00:00:00', '2026-01-01 00:00:00')
ON CONFLICT ("tenantId", "siteId", "role", "kpiKey", "periode") DO UPDATE SET
  "valeur" = EXCLUDED."valeur",
  "cible" = EXCLUDED."cible";

-- ─── 12. Journal d'apprentissage pour audit ─────────────────
INSERT INTO "learnos_journal_apprentissage" ("id", "tenantId", "siteId", "typeAnalyse", "resume", "detail", "echantillon", "perimetre", "createdAt") VALUES
  ('jr-admin-1', 'tenant-ambouli', 'site-ambouli', 'pattern_detection', 'Comparaison inter-sites: Ambouli vs Arhiba (2024-2025)', 'Le site Ambouli montre une maîtrise moyenne de 62.5% contre 58.3% pour Arhiba. L''écart se creuse en mathématiques.', 500, '6eme', '2025-01-15 00:00:00'),
  ('jr-admin-2', 'tenant-ambouli', 'site-ambouli', 'prediction', 'Évolution des prédictions: 2024 vs 2025 (Ambouli)', 'La précision des prédictions est passée de 82% à 86.3% entre les deux années. Le moteur s''améliore avec plus de données.', 100, '6eme', '2026-01-15 00:00:00'),
  ('jr-admin-3', 'tenant-ambouli', 'site-ambouli', 'calibration', 'Calibration des seuils: ajustement 2025', 'Les seuils de difficulté ont été recalibrés. Le seuil critique est passé de 0.35 à 0.30 pour la 6ème en mathématiques.', 200, '6eme', '2025-09-15 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- ─── FIN ─────────────────────────────────────────────────────
-- Le tenant-admin peut maintenant:
-- 1. Basculer entre TOUS les rôles via le dropdown (14 rôles)
-- 2. Accéder au portail parent avec 7 enfants aux profils variés
-- 3. Comparer les prédictions et exercices entre sites et entre années
-- 4. Voir l'évolution des élèves (progression, stagnation, exclusion)
