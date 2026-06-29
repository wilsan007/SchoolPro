-- ============================================================
-- EcolPro — Script de Seed Complet pour les Tests
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- Crée : 1 Super Admin + 1 Tenant (école de démo) + données complètes
-- ============================================================

-- ============================================================
-- ÉTAPE 1 — SUPER ADMIN (sans tenant)
-- Mot de passe : super.admin
-- ============================================================

INSERT INTO "users" (
  "id", "email", "name", "password", "role", "isActive",
  "langue", "createdAt", "updatedAt"
) VALUES (
  'superadmin-001',
  'super.admin@test.com',
  'Super Admin EcolPro',
  '$2a$10$KPSm9uvcAvuPWbTaYXSrmuoi8hK3qAvWoxQxZzDAbdHL4EnxVav0i',
  'SUPER_ADMIN',
  true,
  'fr',
  NOW(), NOW()
) ON CONFLICT ("email") DO UPDATE SET
  "password" = '$2a$10$KPSm9uvcAvuPWbTaYXSrmuoi8hK3qAvWoxQxZzDAbdHL4EnxVav0i',
  "role" = 'SUPER_ADMIN', "isActive" = true;

-- ============================================================
-- ÉTAPE 2 — TENANT (École de démonstration)
-- ============================================================

INSERT INTO "tenants" (
  "id", "name", "slug", "plan", "status",
  "city", "country", "phone", "email",
  "currentYear", "notationMax", "langue", "timezone", "currency",
  "createdAt", "updatedAt"
) VALUES (
  'tenant-demo-001',
  'Lycée Dakar Excellence',
  'lycee-dakar-excellence',
  'PRO',
  'ACTIVE',
  'Dakar', 'SN', '+221 33 123 45 67', 'contact@lycee-dakar.sn',
  '2025-2026', 20, 'fr', 'Africa/Dakar', 'XOF',
  NOW(), NOW()
) ON CONFLICT ("slug") DO NOTHING;

-- ============================================================
-- ÉTAPE 3 — ADMIN DU TENANT (Directeur)
-- Mot de passe : super.admin
-- ============================================================

INSERT INTO "users" (
  "id", "tenantId", "email", "name", "firstName", "lastName",
  "password", "role", "isActive", "phone",
  "createdAt", "updatedAt"
) VALUES (
  'user-admin-001',
  'tenant-demo-001',
  'admin@lycee-dakar.sn',
  'Moussa Diallo',
  'Moussa', 'Diallo',
  '$2a$10$KPSm9uvcAvuPWbTaYXSrmuoi8hK3qAvWoxQxZzDAbdHL4EnxVav0i',
  'TENANT_ADMIN',
  true,
  '+221 77 100 00 01',
  NOW(), NOW()
) ON CONFLICT ("email") DO NOTHING;

-- ============================================================
-- ÉTAPE 4 — ENSEIGNANTS (2 enseignants)
-- Mot de passe : super.admin
-- ============================================================

INSERT INTO "users" (
  "id", "tenantId", "email", "name", "firstName", "lastName",
  "password", "role", "isActive", "phone",
  "createdAt", "updatedAt"
) VALUES
(
  'user-ens-001',
  'tenant-demo-001',
  'ens.math@lycee-dakar.sn',
  'Ibrahima Sow',
  'Ibrahima', 'Sow',
  '$2a$10$KPSm9uvcAvuPWbTaYXSrmuoi8hK3qAvWoxQxZzDAbdHL4EnxVav0i',
  'TEACHER', true, '+221 77 200 00 01',
  NOW(), NOW()
),
(
  'user-ens-002',
  'tenant-demo-001',
  'ens.svt@lycee-dakar.sn',
  'Fatou Ndiaye',
  'Fatou', 'Ndiaye',
  '$2a$10$KPSm9uvcAvuPWbTaYXSrmuoi8hK3qAvWoxQxZzDAbdHL4EnxVav0i',
  'TEACHER', true, '+221 77 200 00 02',
  NOW(), NOW()
)
ON CONFLICT ("email") DO NOTHING;

-- Fiches Enseignants
INSERT INTO "enseignants" ("id", "tenantId", "userId", "specialite", "typeContrat", "dateEntree")
VALUES
  ('ens-001', 'tenant-demo-001', 'user-ens-001', 'Mathématiques', 'CDI', '2020-09-01'),
  ('ens-002', 'tenant-demo-001', 'user-ens-002', 'Sciences de la Vie et de la Terre', 'CDI', '2021-09-01')
ON CONFLICT ("userId") DO NOTHING;

-- ============================================================
-- ÉTAPE 5 — CLASSES
-- ============================================================

INSERT INTO "classes" ("id", "tenantId", "nom", "niveau", "filiere", "effectifMax", "annee", "profPrincipalId")
VALUES
  ('classe-001', 'tenant-demo-001', 'Terminale S1', 'Terminale', 'Scientifique', 40, '2025-2026', 'ens-001'),
  ('classe-002', 'tenant-demo-001', '3ème A', 'Troisième', NULL, 35, '2025-2026', 'ens-002'),
  ('classe-003', 'tenant-demo-001', '6ème B', 'Sixième', NULL, 38, '2025-2026', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 6 — MATIÈRES
-- ============================================================

INSERT INTO "matieres" ("id", "tenantId", "nom", "code", "coefficient", "couleur", "niveau")
VALUES
  ('mat-001', 'tenant-demo-001', 'Mathématiques', 'MATH', 5, '#6366f1', NULL),
  ('mat-002', 'tenant-demo-001', 'Physique-Chimie', 'PHY', 4, '#8b5cf6', NULL),
  ('mat-003', 'tenant-demo-001', 'SVT', 'SVT', 4, '#10b981', NULL),
  ('mat-004', 'tenant-demo-001', 'Français', 'FR', 3, '#f59e0b', NULL),
  ('mat-005', 'tenant-demo-001', 'Anglais', 'ANG', 3, '#3b82f6', NULL),
  ('mat-006', 'tenant-demo-001', 'Histoire-Géographie', 'HG', 2, '#ef4444', NULL),
  ('mat-007', 'tenant-demo-001', 'Philosophie', 'PHILO', 2, '#ec4899', NULL),
  ('mat-008', 'tenant-demo-001', 'EPS', 'EPS', 1, '#14b8a6', NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 7 — ÉLÈVES (5 élèves)
-- ============================================================

INSERT INTO "eleves" (
  "id", "tenantId", "matricule", "nom", "prenom",
  "dateNaissance", "lieuNaissance", "nationalite", "sexe",
  "statut", "classeId", "regime", "anneeInscription",
  "createdAt", "updatedAt"
) VALUES
(
  'eleve-001', 'tenant-demo-001', 'ELV-2025-001',
  'Diallo', 'Amadou',
  '2007-03-15', 'Dakar', 'SN', 'M',
  'ACTIF', 'classe-001', 'externe', '2025-2026',
  NOW(), NOW()
),
(
  'eleve-002', 'tenant-demo-001', 'ELV-2025-002',
  'Mbaye', 'Aïssatou',
  '2007-07-22', 'Saint-Louis', 'SN', 'F',
  'ACTIF', 'classe-001', 'demi-pensionnaire', '2025-2026',
  NOW(), NOW()
),
(
  'eleve-003', 'tenant-demo-001', 'ELV-2025-003',
  'Fall', 'Omar',
  '2009-11-08', 'Thiès', 'SN', 'M',
  'ACTIF', 'classe-002', 'externe', '2025-2026',
  NOW(), NOW()
),
(
  'eleve-004', 'tenant-demo-001', 'ELV-2025-004',
  'Sarr', 'Mariama',
  '2012-05-30', 'Dakar', 'SN', 'F',
  'ACTIF', 'classe-003', 'externe', '2025-2026',
  NOW(), NOW()
),
(
  'eleve-005', 'tenant-demo-001', 'ELV-2025-005',
  'Ndiaye', 'Cheikh',
  '2007-01-12', 'Ziguinchor', 'SN', 'M',
  'ACTIF', 'classe-001', 'interne', '2025-2026',
  NOW(), NOW()
)
ON CONFLICT ("tenantId", "matricule") DO NOTHING;

-- ============================================================
-- ÉTAPE 8 — PARENTS (2 parents)
-- ============================================================

INSERT INTO "parents" ("id", "tenantId", "nom", "prenom", "email", "phone", "createdAt", "updatedAt")
VALUES
  ('parent-001', 'tenant-demo-001', 'Diallo', 'Boubacar', 'boubacar.diallo@gmail.com', '+221 77 300 00 01', NOW(), NOW()),
  ('parent-002', 'tenant-demo-001', 'Mbaye', 'Rokhaya', 'rokhaya.mbaye@gmail.com', '+221 77 300 00 02', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Lien élèves-parents
INSERT INTO "eleve_parents" ("eleveId", "parentId", "lien", "isGardien")
VALUES
  ('eleve-001', 'parent-001', 'PERE', true),
  ('eleve-002', 'parent-002', 'MERE', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 9 — ANNÉE SCOLAIRE & PERIODES
-- ============================================================

INSERT INTO "annees_scolaires" ("id", "tenantId", "libelle", "dateDebut", "dateFin", "isCurrent")
VALUES ('annee-2025-2026', 'tenant-demo-001', '2025-2026', '2025-10-01', '2026-07-31', true)
ON CONFLICT DO NOTHING;

INSERT INTO "periodes" ("id", "anneeId", "nom", "numero", "dateDebut", "dateFin", "isCurrent")
VALUES
  ('periode-t1', 'annee-2025-2026', 'Premier Trimestre', 1, '2025-10-01', '2025-12-20', false),
  ('periode-t2', 'annee-2025-2026', 'Deuxième Trimestre', 2, '2026-01-05', '2026-03-28', true),
  ('periode-t3', 'annee-2025-2026', 'Troisième Trimestre', 3, '2026-04-13', '2026-07-15', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 10 — NOTES (quelques notes pour tester)
-- ============================================================

INSERT INTO "notes" (
  "id", "tenantId", "eleveId", "classeId", "matiereId", "periodeId",
  "type", "intitule", "valeur", "noteMax", "coefficient",
  "date", "isPubliee", "createdAt", "updatedAt"
) VALUES
  ('note-001', 'tenant-demo-001', 'eleve-001', 'classe-001', 'mat-001', 'periode-t2', 'CONTROLE', 'DS Maths N°1', 16.5, 20, 5, '2026-01-20', true, NOW(), NOW()),
  ('note-002', 'tenant-demo-001', 'eleve-001', 'classe-001', 'mat-004', 'periode-t2', 'CONTROLE', 'DS Français N°1', 14, 20, 3, '2026-01-22', true, NOW(), NOW()),
  ('note-003', 'tenant-demo-001', 'eleve-002', 'classe-001', 'mat-001', 'periode-t2', 'CONTROLE', 'DS Maths N°1', 18, 20, 5, '2026-01-20', true, NOW(), NOW()),
  ('note-004', 'tenant-demo-001', 'eleve-002', 'classe-001', 'mat-004', 'periode-t2', 'CONTROLE', 'DS Français N°1', 15.5, 20, 3, '2026-01-22', true, NOW(), NOW()),
  ('note-005', 'tenant-demo-001', 'eleve-003', 'classe-002', 'mat-001', 'periode-t2', 'DEVOIR', 'Devoir Maths', 12, 20, 5, '2026-01-21', true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 11 — ABSENCES (quelques absences)
-- ============================================================

INSERT INTO "absences" (
  "id", "tenantId", "eleveId", "date", "isRetard",
  "motif", "statut", "commentaire", "createdAt", "updatedAt"
) VALUES
  ('abs-001', 'tenant-demo-001', 'eleve-003', '2026-01-15', false, 'MALADIE', 'JUSTIFIEE', 'Certificat médical fourni', NOW(), NOW()),
  ('abs-002', 'tenant-demo-001', 'eleve-005', '2026-01-18', true, 'TRANSPORT', 'EN_ATTENTE', 'Retard de 20 min', NOW(), NOW()),
  ('abs-003', 'tenant-demo-001', 'eleve-001', '2026-01-20', false, 'INJUSTIFIE', 'INJUSTIFIEE', NULL, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 12 — EMPLOI DU TEMPS (quelques créneaux)
-- ============================================================

INSERT INTO "emplois_temps" ("id", "tenantId", "classeId", "matiereId", "enseignantId", "jour", "heureDebut", "heureFin", "salle", "annee")
VALUES
  ('edt-001', 'tenant-demo-001', 'classe-001', 'mat-001', 'ens-001', 'LUNDI', '08:00', '10:00', 'Salle A01', '2025-2026'),
  ('edt-002', 'tenant-demo-001', 'classe-001', 'mat-003', 'ens-002', 'LUNDI', '10:00', '12:00', 'Salle Labo', '2025-2026'),
  ('edt-003', 'tenant-demo-001', 'classe-001', 'mat-001', 'ens-001', 'MERCREDI', '08:00', '10:00', 'Salle A01', '2025-2026'),
  ('edt-004', 'tenant-demo-001', 'classe-002', 'mat-002', 'ens-001', 'MARDI', '14:00', '16:00', 'Salle B02', '2025-2026')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 13 — EXAMEN (1 examen planifié)
-- ============================================================

INSERT INTO "examens" ("id", "tenantId", "intitule", "description", "statut", "dateDebut", "dateFin")
VALUES (
  'exam-001', 'tenant-demo-001',
  'Compositions du 2ème Trimestre 2025-2026',
  'Compositions de fin de 2ème trimestre pour toutes les classes',
  'PROGRAMME',
  '2026-03-16', '2026-03-28'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 14 — FACTURATION (1 facture)
-- ============================================================

INSERT INTO "factures" ("id", "tenantId", "eleveId", "numero", "libelle", "montant", "devise", "statut", "echeance", "createdAt", "updatedAt")
VALUES
  ('facture-001', 'tenant-demo-001', 'eleve-001', 'FACT-2026-001', 'Scolarité 2ème Trimestre 2025-2026', 150000, 'XOF', 'EN_ATTENTE', '2026-02-28', NOW(), NOW()),
  ('facture-002', 'tenant-demo-001', 'eleve-002', 'FACT-2026-002', 'Scolarité 2ème Trimestre 2025-2026', 150000, 'XOF', 'PAYEE', '2026-02-28', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Paiement pour la facture payée
INSERT INTO "paiements" ("id", "factureId", "montant", "devise", "methode", "reference", "date")
VALUES ('paie-001', 'facture-002', 150000, 'XOF', 'wave', 'WAVE-2026-0042', '2026-01-10')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 15 — INVENTAIRE (quelques items)
-- ============================================================

INSERT INTO "inventaire" ("id", "tenantId", "nom", "description", "categorie", "etat", "quantite", "quantiteMin", "localisation", "prixUnitaire", "devise", "createdAt", "updatedAt")
VALUES
  ('inv-001', 'tenant-demo-001', 'Ordinateur portable Dell', 'Latitude 5420 - Intel i5', 'INFORMATIQUE', 'BON', 15, 5, 'Salle informatique', 450000, 'XOF', NOW(), NOW()),
  ('inv-002', 'tenant-demo-001', 'Vidéoprojecteur Epson', 'Projecteur HD 3000 lumens', 'AUDIOVISUEL', 'BON', 4, 2, 'Salle des profs', 280000, 'XOF', NOW(), NOW()),
  ('inv-003', 'tenant-demo-001', 'Table scolaire', 'Bureau biplace élève', 'MOBILIER', 'USE', 120, 20, 'Classes', 25000, 'XOF', NOW(), NOW()),
  ('inv-004', 'tenant-demo-001', 'Extincteur CO2', 'Extincteur 6kg homologué', 'SECURITE', 'BON', 8, 4, 'Couloirs', 45000, 'XOF', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 16 — ALUMNI (1 ancien élève)
-- ============================================================

INSERT INTO "alumni" ("id", "tenantId", "nom", "prenom", "email", "sexe", "anneeDiplome", "classeDepart", "mention", "statut", "etablissement", "formation", "ville", "pays", "accepteContact", "createdAt", "updatedAt")
VALUES (
  'alumni-001', 'tenant-demo-001',
  'Touré', 'Abdoulaye', 'abdoulaye.toure@gmail.com',
  'M', '2024-2025', 'Terminale S', 'Bien',
  'ETUDES_SUPERIEURES', 'Université Cheikh Anta Diop', 'Licence Informatique',
  'Dakar', 'SN', true,
  NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 17 — NOTIFICATION (1 notification)
-- ============================================================

INSERT INTO "notifications" (
  "id", "tenantId", "titre", "contenu", "canal", "statut", "cible",
  "envoyeParId", "nbDestinataires", "envoyeeAt", "createdAt", "updatedAt"
) VALUES (
  'notif-001', 'tenant-demo-001',
  'Bienvenue sur EcolPro !',
  'Votre établissement a été configuré avec succès. Vous pouvez maintenant gérer vos élèves, notes, absences et bien plus encore.',
  'IN_APP', 'ENVOYEE', 'TOUS',
  'user-admin-001', 50, NOW(),
  NOW(), NOW()
) ON CONFLICT DO NOTHING;

-- ============================================================
-- ÉTAPE 18 — COURS EN LIGNE (LMS)
-- ============================================================

INSERT INTO "cours" ("id", "tenantId", "titre", "description", "niveau", "statut", "matiereNom", "classeNom", "auteurNom", "dureeMin", "nbVues", "nbInscrits", "createdAt", "updatedAt")
VALUES (
  'cours-001', 'tenant-demo-001',
  'Les fonctions dérivées - Terminale S',
  'Cours complet sur les fonctions dérivées avec exercices corrigés pour la Terminale scientifique.',
  'AVANCE', 'PUBLIE', 'Mathématiques', 'Terminale S', 'Ibrahima Sow',
  180, 42, 28,
  NOW(), NOW()
) ON CONFLICT DO NOTHING;

INSERT INTO "contenus_cours" ("id", "coursId", "titre", "type", "ordre", "url", "dureeMin", "isGratuit")
VALUES
  ('contenu-001', 'cours-001', 'Introduction aux dérivées', 'VIDEO', 1, 'https://www.youtube.com/watch?v=example1', 25, true),
  ('contenu-002', 'cours-001', 'Cours PDF complet', 'DOCUMENT', 2, 'https://example.com/cours-derivees.pdf', 60, true),
  ('contenu-003', 'cours-001', 'Exercices d''application', 'TEXTE', 3, NULL, 45, false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ✅ VÉRIFICATION FINALE — Comptes de connexion disponibles :
--
-- SUPER ADMIN :
--   Email    : super.admin@test.com
--   Mot de passe : super.admin
--
-- DIRECTEUR D'ÉCOLE (Tenant Admin) :
--   Email    : admin@lycee-dakar.sn
--   Mot de passe : super.admin
--
-- ENSEIGNANT MATHS :
--   Email    : ens.math@lycee-dakar.sn
--   Mot de passe : super.admin
--
-- ENSEIGNANT SVT :
--   Email    : ens.svt@lycee-dakar.sn
--   Mot de passe : super.admin
-- ============================================================
