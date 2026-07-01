-- ============================================================
-- SEED 06 — 20 Enseignants (Users + Enseignant) + Assignation matières
-- ============================================================
-- Répartition :
-- Math (3 profs) : T1→6A+5B, T2→4C+3D, T3→2S+1L
-- Français (3)   : T4→6A+5B, T5→4C+3D, T6→2S+1L
-- Arabe (2)      : T7→6A+4C, T8→5B+3D+2S+1L
-- Anglais (2)    : T9→6A+5B+4C, T10→3D+2S+1L
-- Hist-Géo (2)   : T11→6A+5B+4C, T12→3D+2S+1L
-- SVT (2)        : T13→6A+5B+4C, T14→3D+2S+1L
-- Physique (2)   : T15→6A+5B+4C, T16→3D+2S+1L
-- EPS (2)        : T17→6A+5B+4C, T18→3D+2S+1L
-- Informatique(1): T19→2S+1L+6A
-- Philo (1)      : T20→1L+3D
-- ============================================================

-- 20 Users enseignants (mot de passe : Demo@2026!)
INSERT INTO public.users (id, "tenantId", email, name, "firstName", "lastName", role, "isActive", password, "createdAt", "updatedAt")
VALUES
  ('cly-user-ens-01', 'cly-djibouti-tenant-0001', 'mohamed.ali@lycee-djibouti.ecolpro.app', 'Mohamed Ali', 'Mohamed', 'Ali', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-02', 'cly-djibouti-tenant-0001', 'fatima.aden@lycee-djibouti.ecolpro.app', 'Fatima Aden', 'Fatima', 'Aden', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-03', 'cly-djibouti-tenant-0001', 'abdi.warsame@lycee-djibouti.ecolpro.app', 'Abdi Warsame', 'Abdi', 'Warsame', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-04', 'cly-djibouti-tenant-0001', 'halima.hassan@lycee-djibouti.ecolpro.app', 'Halima Hassan', 'Halima', 'Hassan', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-05', 'cly-djibouti-tenant-0001', 'said.guelleh@lycee-djibouti.ecolpro.app', 'Said Guelleh', 'Said', 'Guelleh', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-06', 'cly-djibouti-tenant-0001', 'asha.mahamoud@lycee-djibouti.ecolpro.app', 'Asha Mahamoud', 'Asha', 'Mahamoud', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-07', 'cly-djibouti-tenant-0001', 'omar.farah@lycee-djibouti.ecolpro.app', 'Omar Farah', 'Omar', 'Farah', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-08', 'cly-djibouti-tenant-0001', 'lul.barkat@lycee-djibouti.ecolpro.app', 'Lul Barkat', 'Lul', 'Barkat', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-09', 'cly-djibouti-tenant-0001', 'yacin.djama@lycee-djibouti.ecolpro.app', 'Yacin Djama', 'Yacin', 'Djama', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-10', 'cly-djibouti-tenant-0001', 'hodan.osman@lycee-djibouti.ecolpro.app', 'Hodan Osman', 'Hodan', 'Osman', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-11', 'cly-djibouti-tenant-0001', 'khalid.ibrahim@lycee-djibouti.ecolpro.app', 'Khalid Ibrahim', 'Khalid', 'Ibrahim', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-12', 'cly-djibouti-tenant-0001', 'nasra.hared@lycee-djibouti.ecolpro.app', 'Nasra Hared', 'Nasra', 'Hared', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-13', 'cly-djibouti-tenant-0001', 'ridwan.abdi@lycee-djibouti.ecolpro.app', 'Ridwan Abdi', 'Ridwan', 'Abdi', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-14', 'cly-djibouti-tenant-0001', 'leyla.yusuf@lycee-djibouti.ecolpro.app', 'Leyla Yusuf', 'Leyla', 'Yusuf', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-15', 'cly-djibouti-tenant-0001', 'ahmed.mumin@lycee-djibouti.ecolpro.app', 'Ahmed Mumin', 'Ahmed', 'Mumin', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-16', 'cly-djibouti-tenant-0001', 'fartun.nour@lycee-djibouti.ecolpro.app', 'Fartun Nour', 'Fartun', 'Nour', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-17', 'cly-djibouti-tenant-0001', 'ismail.robleh@lycee-djibouti.ecolpro.app', 'Ismail Robleh', 'Ismail', 'Robleh', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-18', 'cly-djibouti-tenant-0001', 'deqa.elmi@lycee-djibouti.ecolpro.app', 'Deqa Elmi', 'Deqa', 'Elmi', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-19', 'cly-djibouti-tenant-0001', 'mukhtar.awale@lycee-djibouti.ecolpro.app', 'Mukhtar Awale', 'Mukhtar', 'Awale', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW()),
  ('cly-user-ens-20', 'cly-djibouti-tenant-0001', 'faiza.keyd@lycee-djibouti.ecolpro.app', 'Faiza Keyd', 'Faiza', 'Keyd', 'TEACHER', true, '$2a$10$laTMZjmMx9xgcPNcZtFNceaC6JIJvqjhHlMMBZ8Gwcwfa.At0b4H6', NOW(), NOW());

-- 20 Enseignants
INSERT INTO public.enseignants (id, "tenantId", "userId", matricule, specialite, "typeContrat", "dateEntree")
VALUES
  ('cly-ens-01', 'cly-djibouti-tenant-0001', 'cly-user-ens-01', 'ENS-001', 'Mathématiques', 'CDI', '2020-09-01'),
  ('cly-ens-02', 'cly-djibouti-tenant-0001', 'cly-user-ens-02', 'ENS-002', 'Mathématiques', 'CDI', '2021-09-01'),
  ('cly-ens-03', 'cly-djibouti-tenant-0001', 'cly-user-ens-03', 'ENS-003', 'Mathématiques', 'CDI', '2019-09-01'),
  ('cly-ens-04', 'cly-djibouti-tenant-0001', 'cly-user-ens-04', 'ENS-004', 'Français', 'CDI', '2020-09-01'),
  ('cly-ens-05', 'cly-djibouti-tenant-0001', 'cly-user-ens-05', 'ENS-005', 'Français', 'CDI', '2021-09-01'),
  ('cly-ens-06', 'cly-djibouti-tenant-0001', 'cly-user-ens-06', 'ENS-006', 'Français', 'CDI', '2018-09-01'),
  ('cly-ens-07', 'cly-djibouti-tenant-0001', 'cly-user-ens-07', 'ENS-007', 'Arabe', 'CDI', '2020-09-01'),
  ('cly-ens-08', 'cly-djibouti-tenant-0001', 'cly-user-ens-08', 'ENS-008', 'Arabe', 'CDD', '2022-09-01'),
  ('cly-ens-09', 'cly-djibouti-tenant-0001', 'cly-user-ens-09', 'ENS-009', 'Anglais', 'CDI', '2021-09-01'),
  ('cly-ens-10', 'cly-djibouti-tenant-0001', 'cly-user-ens-10', 'ENS-010', 'Anglais', 'CDI', '2020-09-01'),
  ('cly-ens-11', 'cly-djibouti-tenant-0001', 'cly-user-ens-11', 'ENS-011', 'Histoire-Géographie', 'CDI', '2019-09-01'),
  ('cly-ens-12', 'cly-djibouti-tenant-0001', 'cly-user-ens-12', 'ENS-012', 'Histoire-Géographie', 'CDI', '2022-09-01'),
  ('cly-ens-13', 'cly-djibouti-tenant-0001', 'cly-user-ens-13', 'ENS-013', 'SVT', 'CDI', '2021-09-01'),
  ('cly-ens-14', 'cly-djibouti-tenant-0001', 'cly-user-ens-14', 'ENS-014', 'SVT', 'CDD', '2023-09-01'),
  ('cly-ens-15', 'cly-djibouti-tenant-0001', 'cly-user-ens-15', 'ENS-015', 'Physique-Chimie', 'CDI', '2020-09-01'),
  ('cly-ens-16', 'cly-djibouti-tenant-0001', 'cly-user-ens-16', 'ENS-016', 'Physique-Chimie', 'CDI', '2021-09-01'),
  ('cly-ens-17', 'cly-djibouti-tenant-0001', 'cly-user-ens-17', 'ENS-017', 'EPS', 'CDI', '2019-09-01'),
  ('cly-ens-18', 'cly-djibouti-tenant-0001', 'cly-user-ens-18', 'ENS-018', 'EPS', 'CDD', '2022-09-01'),
  ('cly-ens-19', 'cly-djibouti-tenant-0001', 'cly-user-ens-19', 'ENS-019', 'Informatique', 'CDI', '2023-09-01'),
  ('cly-ens-20', 'cly-djibouti-tenant-0001', 'cly-user-ens-20', 'ENS-020', 'Philosophie', 'CDI', '2020-09-01');

-- Professeurs principaux (1 par classe)
UPDATE public.classes SET "profPrincipalId" = 'cly-ens-01' WHERE id = 'cly-classe-6eme-a';
UPDATE public.classes SET "profPrincipalId" = 'cly-ens-05' WHERE id = 'cly-classe-5eme-b';
UPDATE public.classes SET "profPrincipalId" = 'cly-ens-02' WHERE id = 'cly-classe-4eme-c';
UPDATE public.classes SET "profPrincipalId" = 'cly-ens-12' WHERE id = 'cly-classe-3eme-d';
UPDATE public.classes SET "profPrincipalId" = 'cly-ens-03' WHERE id = 'cly-classe-2nde-s';
UPDATE public.classes SET "profPrincipalId" = 'cly-ens-06' WHERE id = 'cly-classe-1ere-l';
