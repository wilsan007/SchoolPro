-- ============================================================
-- SEED 08 — Contacts complets : Admin, Enseignants, Parents + Liaisons
-- Date: 2025-07-03
-- Tenant: cly-djibouti-tenant-0001 (Lycée Mohamed Hashim Ledi)
-- ============================================================
-- Ce script :
-- 1. Ajoute la colonne telegramChatId sur la table parents
-- 2. Met à jour les téléphones de l'admin et des 20 enseignants
-- 3. Crée 10 parents avec téléphone, email, telegramChatId, profession
-- 4. Lie chaque parent à 1 ou plusieurs élèves
-- 5. Tout est compatible avec le module Paramètres (onglets Utilisateurs & Parents)
-- ============================================================

-- ============================================================
-- ÉTAPE 1 — Migration : ajout colonne telegramChatId sur parents
-- ============================================================
ALTER TABLE public.parents ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;

-- ============================================================
-- ÉTAPE 2 — Téléphone de l'administrateur
-- ============================================================
UPDATE public.users
SET phone = '253771234567', "updatedAt" = NOW()
WHERE id = 'cly-user-admin-0001';

-- ============================================================
-- ÉTAPE 3 — Téléphones des 20 enseignants (users)
-- ============================================================
UPDATE public.users SET phone = '253778010101', "updatedAt" = NOW() WHERE id = 'cly-user-ens-01';
UPDATE public.users SET phone = '253778010102', "updatedAt" = NOW() WHERE id = 'cly-user-ens-02';
UPDATE public.users SET phone = '253778010103', "updatedAt" = NOW() WHERE id = 'cly-user-ens-03';
UPDATE public.users SET phone = '253778010104', "updatedAt" = NOW() WHERE id = 'cly-user-ens-04';
UPDATE public.users SET phone = '253778010105', "updatedAt" = NOW() WHERE id = 'cly-user-ens-05';
UPDATE public.users SET phone = '253778010106', "updatedAt" = NOW() WHERE id = 'cly-user-ens-06';
UPDATE public.users SET phone = '253778010107', "updatedAt" = NOW() WHERE id = 'cly-user-ens-07';
UPDATE public.users SET phone = '253778010108', "updatedAt" = NOW() WHERE id = 'cly-user-ens-08';
UPDATE public.users SET phone = '253778010109', "updatedAt" = NOW() WHERE id = 'cly-user-ens-09';
UPDATE public.users SET phone = '253778010110', "updatedAt" = NOW() WHERE id = 'cly-user-ens-10';
UPDATE public.users SET phone = '253778010111', "updatedAt" = NOW() WHERE id = 'cly-user-ens-11';
UPDATE public.users SET phone = '253778010112', "updatedAt" = NOW() WHERE id = 'cly-user-ens-12';
UPDATE public.users SET phone = '253778010113', "updatedAt" = NOW() WHERE id = 'cly-user-ens-13';
UPDATE public.users SET phone = '253778010114', "updatedAt" = NOW() WHERE id = 'cly-user-ens-14';
UPDATE public.users SET phone = '253778010115', "updatedAt" = NOW() WHERE id = 'cly-user-ens-15';
UPDATE public.users SET phone = '253778010116', "updatedAt" = NOW() WHERE id = 'cly-user-ens-16';
UPDATE public.users SET phone = '253778010117', "updatedAt" = NOW() WHERE id = 'cly-user-ens-17';
UPDATE public.users SET phone = '253778010118', "updatedAt" = NOW() WHERE id = 'cly-user-ens-18';
UPDATE public.users SET phone = '253778010119', "updatedAt" = NOW() WHERE id = 'cly-user-ens-19';
UPDATE public.users SET phone = '253778010120', "updatedAt" = NOW() WHERE id = 'cly-user-ens-20';

-- ============================================================
-- ÉTAPE 4 — Création de 10 Parents (sans compte User lié)
-- Les parents sont créés directement dans la table parents.
-- Le module Paramètres > "Parents & Contacts" les affichera.
-- ============================================================
-- Mot de passe par défaut si on crée un compte User plus tard : Demo@2026!

INSERT INTO public.parents (id, "tenantId", nom, prenom, phone, phone2, email, "telegramChatId", profession, adresse, "createdAt", "updatedAt")
VALUES
  -- Parent 1 : Farah (père de Abdillahi Farah 6A-01 et Amina Farah 6A-02)
  ('cly-par-001', 'cly-djibouti-tenant-0001',
   'Farah', 'Abdillahi Senior',
   '253772010001', '253778890001',
   'farah.abdillahi@gmail.com',
   NULL,
   'Comptable',
   'Quartier 4, Djibouti',
   NOW(), NOW()),

  -- Parent 2 : Mahamoud (mère de Amina Mahamoud 6A-02 et Samira Mahmoud 5B-01)
  ('cly-par-002', 'cly-djibouti-tenant-0001',
   'Mahamoud', 'Amina Senior',
   '253772010002', '253778890002',
   'amina.mahamoud@gmail.com',
   NULL,
   'Enseignante',
   'Quartier 6, Djibouti',
   NOW(), NOW()),

  -- Parent 3 : Aden (père de Yousuf Aden 6A-03)
  ('cly-par-003', 'cly-djibouti-tenant-0001',
   'Aden', 'Yousuf Senior',
   '253772010003', NULL,
   'yousuf.aden@gmail.com',
   NULL,
   'Commerçant',
   'Arta, Djibouti',
   NOW(), NOW()),

  -- Parent 4 : Osman (mère de Hodan Osman 6A-04 et Kamil Abdullahi 5B-02)
  ('cly-par-004', 'cly-djibouti-tenant-0001',
   'Osman', 'Hodan Senior',
   '253772010004', '253778890004',
   'hodan.osman@gmail.com',
   NULL,
   'Infirmière',
   'Quartier 1, Djibouti',
   NOW(), NOW()),

  -- Parent 5 : Ibrahim (père de Mahad Ibrahim 6A-05 et Mahad Abdi 4C-01)
  ('cly-par-005', 'cly-djibouti-tenant-0001',
   'Ibrahim', 'Mahad Senior',
   '253772010005', NULL,
   'ibrahim.mahad@gmail.com',
   NULL,
   'Ingénieur',
   'Ali Sabieh, Djibouti',
   NOW(), NOW()),

  -- Parent 6 : Hassan (père de Khalid Mohamed 6A-07 et Hibo Hussein 5B-03)
  ('cly-par-006', 'cly-djibouti-tenant-0001',
   'Hassan', 'Khalid Senior',
   '253772010006', '253778890006',
   'khalid.hassan@gmail.com',
   NULL,
   'Fonctionnaire',
   'Obock, Djibouti',
   NOW(), NOW()),

  -- Parent 7 : Mahmoud (père de Samira Mahmoud 5B-01 et Kamil Abdullahi 5B-02)
  ('cly-par-007', 'cly-djibouti-tenant-0001',
   'Mahmoud', 'Samira Senior',
   '253772010007', NULL,
   'samira.mahmoud@gmail.com',
   NULL,
   'Médecin',
   'Quartier 3, Djibouti',
   NOW(), NOW()),

  -- Parent 8 : Abdullahi (père de Kamil Abdullahi 5B-02)
  ('cly-par-008', 'cly-djibouti-tenant-0001',
   'Abdullahi', 'Kamil Senior',
   '253772010008', '253778890008',
   'kamil.abdullahi@gmail.com',
   NULL,
   'Avocat',
   'Quartier 5, Djibouti',
   NOW(), NOW()),

  -- Parent 9 : Hussein (mère de Hibo Hussein 5B-03 et Yousuf Aden 6A-03)
  ('cly-par-009', 'cly-djibouti-tenant-0001',
   'Hussein', 'Hibo Senior',
   '253772010009', NULL,
   'hibo.hussein@gmail.com',
   NULL,
   'Commerçante',
   'Tadjourah, Djibouti',
   NOW(), NOW()),

  -- Parent 10 : Yacin (père de Mahamoud Yacin 5B-04 et Amina Farah 6A-02)
  ('cly-par-010', 'cly-djibouti-tenant-0001',
   'Yacin', 'Mahamoud Senior',
   '253772010010', '253778890010',
   'mahamoud.yacin@gmail.com',
   NULL,
   'Chauffeur de taxi',
   'Quartier 2, Djibouti',
   NOW(), NOW())

ON CONFLICT (id) DO UPDATE SET
  phone = EXCLUDED.phone,
  phone2 = EXCLUDED.phone2,
  email = EXCLUDED.email,
  "telegramChatId" = EXCLUDED."telegramChatId",
  profession = EXCLUDED.profession,
  adresse = EXCLUDED.adresse,
  "updatedAt" = NOW();

-- ============================================================
-- ÉTAPE 5 — Liaisons Parents ↔ Élèves (table eleve_parent)
-- ============================================================
-- Schéma : (eleveId, parentId, lien, "isGardien")
-- lien: PERE, MERE, TUTEUR, AUTRE

INSERT INTO public.eleve_parent ("eleveId", "parentId", lien, "isGardien", "createdAt", "updatedAt")
VALUES
  -- Parent 1 (Farah) → Abdillahi Farah (6A-01) + Amina Farah (6A-02, partagé)
  ('cly-elv-6a-01', 'cly-par-001', 'PERE', true, NOW(), NOW()),
  ('cly-elv-6a-02', 'cly-par-001', 'PERE', false, NOW(), NOW()),

  -- Parent 2 (Mahamoud) → Amina Mahamoud (6A-02) + Samira Mahmoud (5B-01)
  ('cly-elv-6a-02', 'cly-par-002', 'MERE', true, NOW(), NOW()),
  ('cly-elv-5b-01', 'cly-par-002', 'MERE', true, NOW(), NOW()),

  -- Parent 3 (Aden) → Yousuf Aden (6A-03)
  ('cly-elv-6a-03', 'cly-par-003', 'PERE', true, NOW(), NOW()),

  -- Parent 4 (Osman) → Hodan Osman (6A-04) + Kamil Abdullahi (5B-02, partagé)
  ('cly-elv-6a-04', 'cly-par-004', 'MERE', true, NOW(), NOW()),
  ('cly-elv-5b-02', 'cly-par-004', 'TUTEUR', false, NOW(), NOW()),

  -- Parent 5 (Ibrahim) → Mahad Ibrahim (6A-05) + Mahad Abdi (4C-01)
  ('cly-elv-6a-05', 'cly-par-005', 'PERE', true, NOW(), NOW()),
  ('cly-elv-4c-01', 'cly-par-005', 'TUTEUR', true, NOW(), NOW()),

  -- Parent 6 (Hassan) → Khalid Mohamed (6A-07) + Hibo Hussein (5B-03, partagé)
  ('cly-elv-6a-07', 'cly-par-006', 'PERE', true, NOW(), NOW()),
  ('cly-elv-5b-03', 'cly-par-006', 'TUTEUR', false, NOW(), NOW()),

  -- Parent 7 (Mahmoud) → Samira Mahmoud (5B-01, partagé) + Kamil Abdullahi (5B-02, partagé)
  ('cly-elv-5b-01', 'cly-par-007', 'PERE', false, NOW(), NOW()),
  ('cly-elv-5b-02', 'cly-par-007', 'TUTEUR', true, NOW(), NOW()),

  -- Parent 8 (Abdullahi) → Kamil Abdullahi (5B-02, partagé)
  ('cly-elv-5b-02', 'cly-par-008', 'PERE', true, NOW(), NOW()),

  -- Parent 9 (Hussein) → Hibo Hussein (5B-03, partagé) + Yousuf Aden (6A-03, partagé)
  ('cly-elv-5b-03', 'cly-par-009', 'MERE', true, NOW(), NOW()),
  ('cly-elv-6a-03', 'cly-par-009', 'TUTEUR', false, NOW(), NOW()),

  -- Parent 10 (Yacin) → Mahamoud Yacin (5B-04) + Amina Farah (6A-02, partagé)
  ('cly-elv-5b-04', 'cly-par-010', 'PERE', true, NOW(), NOW()),
  ('cly-elv-6a-02', 'cly-par-010', 'TUTEUR', false, NOW(), NOW())

ON CONFLICT ("eleveId", "parentId") DO NOTHING;

-- ============================================================
-- ÉTAPE 6 — Vérification (à exécuter pour contrôler)
-- ============================================================
-- -- Voir les parents avec leurs élèves liés :
-- SELECT p.id, p.prenom, p.nom, p.phone, p."telegramChatId",
--        e.prenom AS eleve_prenom, e.nom AS eleve_nom, c.nom AS classe
-- FROM parents p
-- JOIN eleve_parent ep ON ep."parentId" = p.id
-- JOIN eleves e ON e.id = ep."eleveId"
-- LEFT JOIN classes c ON c.id = e."classeId"
-- ORDER BY p.nom, e.nom;
--
-- -- Voir les utilisateurs avec téléphone :
-- SELECT id, name, role, phone FROM users ORDER BY role, name;
--
-- -- Compter les parents et liaisons :
-- SELECT COUNT(*) AS nb_parents FROM parents;
-- SELECT COUNT(*) AS nb_liaisons FROM eleve_parent;
