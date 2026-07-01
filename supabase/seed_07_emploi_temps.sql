-- ============================================================
-- SEED 07 — Emploi du temps (6 classes × 10 matières, 20 salles)
-- Aucun conflit : un prof n'est jamais dans 2 salles au même créneau
--                  une salle n'a jamais 2 cours au même créneau
--
-- Créneaux : S1=08:00-09:00, S2=09:00-10:00, S3=10:15-11:15,
--            S4=11:15-12:15, S5=14:00-15:00, S6=15:00-16:00, S7=16:00-17:00
-- Jours : LUNDI→SAMEDI
-- Salles : Salle 01→Salle 20
-- ============================================================

INSERT INTO public.emplois_temps (id, "tenantId", "classeId", "matiereId", "enseignantId", jour, "heureDebut", "heureFin", salle, annee)
VALUES
-- =========================================================
-- 6ème A — Prof : Math=T1, FR=T4, AR=T7, ANG=T9, HG=T11, SVT=T13, PHY=T15, EPS=T17, INFO=T19
-- =========================================================
('cly-edt-6a-01', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-math',    'cly-ens-01', 'LUNDI',    '08:00', '09:00', 'Salle 01', '2025-2026'),
('cly-edt-6a-02', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-math',    'cly-ens-01', 'MARDI',    '08:00', '09:00', 'Salle 01', '2025-2026'),
('cly-edt-6a-03', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-math',    'cly-ens-01', 'JEUDI',    '08:00', '09:00', 'Salle 01', '2025-2026'),
('cly-edt-6a-04', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-math',    'cly-ens-01', 'VENDREDI', '08:00', '09:00', 'Salle 01', '2025-2026'),
('cly-edt-6a-05', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-fr',      'cly-ens-04', 'LUNDI',    '09:00', '10:00', 'Salle 02', '2025-2026'),
('cly-edt-6a-06', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-fr',      'cly-ens-04', 'MARDI',    '09:00', '10:00', 'Salle 02', '2025-2026'),
('cly-edt-6a-07', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-fr',      'cly-ens-04', 'JEUDI',    '09:00', '10:00', 'Salle 02', '2025-2026'),
('cly-edt-6a-08', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-fr',      'cly-ens-04', 'VENDREDI', '09:00', '10:00', 'Salle 02', '2025-2026'),
('cly-edt-6a-09', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-ar',      'cly-ens-07', 'LUNDI',    '10:15', '11:15', 'Salle 03', '2025-2026'),
('cly-edt-6a-10', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-ar',      'cly-ens-07', 'JEUDI',    '10:15', '11:15', 'Salle 03', '2025-2026'),
('cly-edt-6a-11', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-ang',     'cly-ens-09', 'MARDI',    '10:15', '11:15', 'Salle 04', '2025-2026'),
('cly-edt-6a-12', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-ang',     'cly-ens-09', 'VENDREDI', '10:15', '11:15', 'Salle 04', '2025-2026'),
('cly-edt-6a-13', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-histgeo', 'cly-ens-11', 'MERCREDI', '08:00', '09:00', 'Salle 05', '2025-2026'),
('cly-edt-6a-14', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-histgeo', 'cly-ens-11', 'VENDREDI', '11:15', '12:15', 'Salle 05', '2025-2026'),
('cly-edt-6a-15', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-svt',     'cly-ens-13', 'MERCREDI', '09:00', '10:00', 'Salle 06', '2025-2026'),
('cly-edt-6a-16', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-svt',     'cly-ens-13', 'VENDREDI', '14:00', '15:00', 'Salle 06', '2025-2026'),
('cly-edt-6a-17', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-phys',    'cly-ens-15', 'MERCREDI', '10:15', '11:15', 'Salle 07', '2025-2026'),
('cly-edt-6a-18', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-phys',    'cly-ens-15', 'JEUDI',    '11:15', '12:15', 'Salle 07', '2025-2026'),
('cly-edt-6a-19', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-phys',    'cly-ens-15', 'JEUDI',    '14:00', '15:00', 'Salle 07', '2025-2026'),
('cly-edt-6a-20', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-eps',     'cly-ens-17', 'MERCREDI', '14:00', '15:00', 'Gymnase',  '2025-2026'),
('cly-edt-6a-21', 'cly-djibouti-tenant-0001', 'cly-classe-6eme-a', 'cly-mat-info',    'cly-ens-19', 'SAMEDI',   '08:00', '09:00', 'Salle 08', '2025-2026'),

-- =========================================================
-- 5ème B — Prof : Math=T1, FR=T4, AR=T8, ANG=T9, HG=T11, SVT=T13, PHY=T15, EPS=T17
-- T1 enseigne 5B à des créneaux différents de 6A
-- =========================================================
('cly-edt-5b-01', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-math',    'cly-ens-01', 'LUNDI',    '10:15', '11:15', 'Salle 09', '2025-2026'),
('cly-edt-5b-02', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-math',    'cly-ens-01', 'MARDI',    '10:15', '11:15', 'Salle 09', '2025-2026'),
('cly-edt-5b-03', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-math',    'cly-ens-01', 'JEUDI',    '10:15', '11:15', 'Salle 09', '2025-2026'),
('cly-edt-5b-04', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-math',    'cly-ens-01', 'VENDREDI', '10:15', '11:15', 'Salle 09', '2025-2026'),
('cly-edt-5b-05', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-fr',      'cly-ens-04', 'LUNDI',    '11:15', '12:15', 'Salle 10', '2025-2026'),
('cly-edt-5b-06', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-fr',      'cly-ens-04', 'MARDI',    '11:15', '12:15', 'Salle 10', '2025-2026'),
('cly-edt-5b-07', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-fr',      'cly-ens-04', 'JEUDI',    '11:15', '12:15', 'Salle 10', '2025-2026'),
('cly-edt-5b-08', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-fr',      'cly-ens-04', 'VENDREDI', '11:15', '12:15', 'Salle 10', '2025-2026'),
('cly-edt-5b-09', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-ar',      'cly-ens-08', 'LUNDI',    '14:00', '15:00', 'Salle 11', '2025-2026'),
('cly-edt-5b-10', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-ar',      'cly-ens-08', 'JEUDI',    '14:00', '15:00', 'Salle 11', '2025-2026'),
('cly-edt-5b-11', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-ang',     'cly-ens-09', 'MARDI',    '14:00', '15:00', 'Salle 12', '2025-2026'),
('cly-edt-5b-12', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-ang',     'cly-ens-09', 'VENDREDI', '14:00', '15:00', 'Salle 12', '2025-2026'),
('cly-edt-5b-13', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-histgeo', 'cly-ens-11', 'MERCREDI', '11:15', '12:15', 'Salle 13', '2025-2026'),
('cly-edt-5b-14', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-histgeo', 'cly-ens-11', 'VENDREDI', '15:00', '16:00', 'Salle 13', '2025-2026'),
('cly-edt-5b-15', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-svt',     'cly-ens-13', 'MERCREDI', '14:00', '15:00', 'Salle 14', '2025-2026'),
('cly-edt-5b-16', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-svt',     'cly-ens-13', 'SAMEDI',   '09:00', '10:00', 'Salle 14', '2025-2026'),
('cly-edt-5b-17', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-phys',    'cly-ens-15', 'MERCREDI', '15:00', '16:00', 'Salle 15', '2025-2026'),
('cly-edt-5b-18', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-phys',    'cly-ens-15', 'SAMEDI',   '10:15', '11:15', 'Salle 15', '2025-2026'),
('cly-edt-5b-19', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-phys',    'cly-ens-15', 'SAMEDI',   '11:15', '12:15', 'Salle 15', '2025-2026'),
('cly-edt-5b-20', 'cly-djibouti-tenant-0001', 'cly-classe-5eme-b', 'cly-mat-eps',     'cly-ens-17', 'MERCREDI', '16:00', '17:00', 'Gymnase',  '2025-2026'),

-- =========================================================
-- 4ème C — Prof : Math=T2, FR=T5, AR=T7, ANG=T9, HG=T11, SVT=T13, PHY=T15, EPS=T17, INFO=T19
-- T2, T5 nouveaux profs. T7, T9, T11, T13, T15, T17 à créneaux différents
-- =========================================================
('cly-edt-4c-01', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-math',    'cly-ens-02', 'LUNDI',    '08:00', '09:00', 'Salle 03', '2025-2026'),
('cly-edt-4c-02', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-math',    'cly-ens-02', 'MERCREDI', '08:00', '09:00', 'Salle 03', '2025-2026'),
('cly-edt-4c-03', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-math',    'cly-ens-02', 'JEUDI',    '09:00', '10:00', 'Salle 03', '2025-2026'),
('cly-edt-4c-04', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-math',    'cly-ens-02', 'VENDREDI', '08:00', '09:00', 'Salle 03', '2025-2026'),
('cly-edt-4c-05', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-fr',      'cly-ens-05', 'LUNDI',    '09:00', '10:00', 'Salle 04', '2025-2026'),
('cly-edt-4c-06', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-fr',      'cly-ens-05', 'MERCREDI', '09:00', '10:00', 'Salle 04', '2025-2026'),
('cly-edt-4c-07', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-fr',      'cly-ens-05', 'JEUDI',    '10:15', '11:15', 'Salle 04', '2025-2026'),
('cly-edt-4c-08', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-fr',      'cly-ens-05', 'VENDREDI', '09:00', '10:00', 'Salle 04', '2025-2026'),
('cly-edt-4c-09', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-ar',      'cly-ens-07', 'MARDI',    '08:00', '09:00', 'Salle 05', '2025-2026'),
('cly-edt-4c-10', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-ar',      'cly-ens-07', 'VENDREDI', '14:00', '15:00', 'Salle 05', '2025-2026'),
('cly-edt-4c-11', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-ang',     'cly-ens-09', 'MARDI',    '09:00', '10:00', 'Salle 06', '2025-2026'),
('cly-edt-4c-12', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-ang',     'cly-ens-09', 'VENDREDI', '15:00', '16:00', 'Salle 06', '2025-2026'),
('cly-edt-4c-13', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-histgeo', 'cly-ens-11', 'LUNDI',    '14:00', '15:00', 'Salle 07', '2025-2026'),
('cly-edt-4c-14', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-histgeo', 'cly-ens-11', 'MERCREDI', '11:15', '12:15', 'Salle 07', '2025-2026'),
('cly-edt-4c-15', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-svt',     'cly-ens-13', 'LUNDI',    '15:00', '16:00', 'Salle 08', '2025-2026'),
('cly-edt-4c-16', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-svt',     'cly-ens-13', 'MERCREDI', '14:00', '15:00', 'Salle 08', '2025-2026'),
('cly-edt-4c-17', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-phys',    'cly-ens-15', 'MARDI',    '11:15', '12:15', 'Salle 09', '2025-2026'),
('cly-edt-4c-18', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-phys',    'cly-ens-15', 'JEUDI',    '14:00', '15:00', 'Salle 09', '2025-2026'),
('cly-edt-4c-19', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-phys',    'cly-ens-15', 'JEUDI',    '15:00', '16:00', 'Salle 09', '2025-2026'),
('cly-edt-4c-20', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-eps',     'cly-ens-17', 'MERCREDI', '15:00', '16:00', 'Terrain',  '2025-2026'),
('cly-edt-4c-21', 'cly-djibouti-tenant-0001', 'cly-classe-4eme-c', 'cly-mat-info',    'cly-ens-19', 'SAMEDI',   '09:00', '10:00', 'Salle 16', '2025-2026'),

-- =========================================================
-- 3ème D — Prof : Math=T2, FR=T5, AR=T8, ANG=T10, HG=T12, SVT=T14, PHY=T16, EPS=T18, PHILO=T20
-- =========================================================
('cly-edt-3d-01', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-math',    'cly-ens-02', 'LUNDI',    '10:15', '11:15', 'Salle 10', '2025-2026'),
('cly-edt-3d-02', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-math',    'cly-ens-02', 'MERCREDI', '10:15', '11:15', 'Salle 10', '2025-2026'),
('cly-edt-3d-03', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-math',    'cly-ens-02', 'JEUDI',    '11:15', '12:15', 'Salle 10', '2025-2026'),
('cly-edt-3d-04', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-math',    'cly-ens-02', 'VENDREDI', '10:15', '11:15', 'Salle 10', '2025-2026'),
('cly-edt-3d-05', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-fr',      'cly-ens-05', 'LUNDI',    '11:15', '12:15', 'Salle 11', '2025-2026'),
('cly-edt-3d-06', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-fr',      'cly-ens-05', 'MERCREDI', '11:15', '12:15', 'Salle 11', '2025-2026'),
('cly-edt-3d-07', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-fr',      'cly-ens-05', 'JEUDI',    '14:00', '15:00', 'Salle 11', '2025-2026'),
('cly-edt-3d-08', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-fr',      'cly-ens-05', 'VENDREDI', '11:15', '12:15', 'Salle 11', '2025-2026'),
('cly-edt-3d-09', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-ar',      'cly-ens-08', 'MARDI',    '10:15', '11:15', 'Salle 12', '2025-2026'),
('cly-edt-3d-10', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-ar',      'cly-ens-08', 'VENDREDI', '14:00', '15:00', 'Salle 12', '2025-2026'),
('cly-edt-3d-11', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-ang',     'cly-ens-10', 'MARDI',    '11:15', '12:15', 'Salle 13', '2025-2026'),
('cly-edt-3d-12', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-ang',     'cly-ens-10', 'VENDREDI', '15:00', '16:00', 'Salle 13', '2025-2026'),
('cly-edt-3d-13', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-histgeo', 'cly-ens-12', 'LUNDI',    '14:00', '15:00', 'Salle 14', '2025-2026'),
('cly-edt-3d-14', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-histgeo', 'cly-ens-12', 'MERCREDI', '14:00', '15:00', 'Salle 14', '2025-2026'),
('cly-edt-3d-15', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-svt',     'cly-ens-14', 'LUNDI',    '15:00', '16:00', 'Salle 15', '2025-2026'),
('cly-edt-3d-16', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-svt',     'cly-ens-14', 'JEUDI',    '15:00', '16:00', 'Salle 15', '2025-2026'),
('cly-edt-3d-17', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-phys',    'cly-ens-16', 'MARDI',    '14:00', '15:00', 'Salle 16', '2025-2026'),
('cly-edt-3d-18', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-phys',    'cly-ens-16', 'JEUDI',    '16:00', '17:00', 'Salle 16', '2025-2026'),
('cly-edt-3d-19', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-phys',    'cly-ens-16', 'VENDREDI', '16:00', '17:00', 'Salle 16', '2025-2026'),
('cly-edt-3d-20', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-eps',     'cly-ens-18', 'MERCREDI', '16:00', '17:00', 'Terrain',  '2025-2026'),
('cly-edt-3d-21', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-philo',   'cly-ens-20', 'SAMEDI',   '10:15', '11:15', 'Salle 17', '2025-2026'),
('cly-edt-3d-22', 'cly-djibouti-tenant-0001', 'cly-classe-3eme-d', 'cly-mat-philo',   'cly-ens-20', 'SAMEDI',   '11:15', '12:15', 'Salle 17', '2025-2026'),

-- =========================================================
-- 2nde S — Prof : Math=T3, FR=T6, AR=T8, ANG=T10, HG=T12, SVT=T14, PHY=T16, EPS=T18, INFO=T19
-- =========================================================
('cly-edt-2s-01', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-math',    'cly-ens-03', 'LUNDI',    '08:00', '09:00', 'Salle 06', '2025-2026'),
('cly-edt-2s-02', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-math',    'cly-ens-03', 'MARDI',    '08:00', '09:00', 'Salle 06', '2025-2026'),
('cly-edt-2s-03', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-math',    'cly-ens-03', 'JEUDI',    '08:00', '09:00', 'Salle 06', '2025-2026'),
('cly-edt-2s-04', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-math',    'cly-ens-03', 'VENDREDI', '08:00', '09:00', 'Salle 06', '2025-2026'),
('cly-edt-2s-05', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-math',    'cly-ens-03', 'MERCREDI', '08:00', '09:00', 'Salle 06', '2025-2026'),
('cly-edt-2s-06', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-fr',      'cly-ens-06', 'LUNDI',    '09:00', '10:00', 'Salle 07', '2025-2026'),
('cly-edt-2s-07', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-fr',      'cly-ens-06', 'JEUDI',    '09:00', '10:00', 'Salle 07', '2025-2026'),
('cly-edt-2s-08', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-fr',      'cly-ens-06', 'VENDREDI', '09:00', '10:00', 'Salle 07', '2025-2026'),
('cly-edt-2s-09', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-ar',      'cly-ens-08', 'MARDI',    '09:00', '10:00', 'Salle 08', '2025-2026'),
('cly-edt-2s-10', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-ar',      'cly-ens-08', 'VENDREDI', '10:15', '11:15', 'Salle 08', '2025-2026'),
('cly-edt-2s-11', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-ang',     'cly-ens-10', 'MARDI',    '10:15', '11:15', 'Salle 09', '2025-2026'),
('cly-edt-2s-12', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-ang',     'cly-ens-10', 'VENDREDI', '11:15', '12:15', 'Salle 09', '2025-2026'),
('cly-edt-2s-13', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-histgeo', 'cly-ens-12', 'LUNDI',    '10:15', '11:15', 'Salle 10', '2025-2026'),
('cly-edt-2s-14', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-histgeo', 'cly-ens-12', 'MERCREDI', '09:00', '10:00', 'Salle 10', '2025-2026'),
('cly-edt-2s-15', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-svt',     'cly-ens-14', 'LUNDI',    '11:15', '12:15', 'Salle 11', '2025-2026'),
('cly-edt-2s-16', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-svt',     'cly-ens-14', 'MERCREDI', '10:15', '11:15', 'Salle 11', '2025-2026'),
('cly-edt-2s-17', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-svt',     'cly-ens-14', 'JEUDI',    '10:15', '11:15', 'Salle 11', '2025-2026'),
('cly-edt-2s-18', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-phys',    'cly-ens-16', 'LUNDI',    '14:00', '15:00', 'Salle 12', '2025-2026'),
('cly-edt-2s-19', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-phys',    'cly-ens-16', 'MARDI',    '11:15', '12:15', 'Salle 12', '2025-2026'),
('cly-edt-2s-20', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-phys',    'cly-ens-16', 'JEUDI',    '11:15', '12:15', 'Salle 12', '2025-2026'),
('cly-edt-2s-21', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-eps',     'cly-ens-18', 'MERCREDI', '11:15', '12:15', 'Gymnase',  '2025-2026'),
('cly-edt-2s-22', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-info',    'cly-ens-19', 'SAMEDI',   '08:00', '09:00', 'Salle 18', '2025-2026'),
('cly-edt-2s-23', 'cly-djibouti-tenant-0001', 'cly-classe-2nde-s', 'cly-mat-info',    'cly-ens-19', 'SAMEDI',   '09:00', '10:00', 'Salle 18', '2025-2026'),

-- =========================================================
-- 1ère L — Prof : Math=T3, FR=T6, AR=T8, ANG=T10, HG=T12, SVT=T14, EPS=T18, INFO=T19, PHILO=T20
-- =========================================================
('cly-edt-1l-01', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-math',    'cly-ens-03', 'LUNDI',    '10:15', '11:15', 'Salle 13', '2025-2026'),
('cly-edt-1l-02', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-math',    'cly-ens-03', 'VENDREDI', '10:15', '11:15', 'Salle 13', '2025-2026'),
('cly-edt-1l-03', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-fr',      'cly-ens-06', 'LUNDI',    '11:15', '12:15', 'Salle 14', '2025-2026'),
('cly-edt-1l-04', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-fr',      'cly-ens-06', 'MARDI',    '08:00', '09:00', 'Salle 14', '2025-2026'),
('cly-edt-1l-05', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-fr',      'cly-ens-06', 'JEUDI',    '10:15', '11:15', 'Salle 14', '2025-2026'),
('cly-edt-1l-06', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-fr',      'cly-ens-06', 'VENDREDI', '11:15', '12:15', 'Salle 14', '2025-2026'),
('cly-edt-1l-07', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-ar',      'cly-ens-08', 'MARDI',    '14:00', '15:00', 'Salle 15', '2025-2026'),
('cly-edt-1l-08', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-ar',      'cly-ens-08', 'JEUDI',    '14:00', '15:00', 'Salle 15', '2025-2026'),
('cly-edt-1l-09', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-ang',     'cly-ens-10', 'MARDI',    '15:00', '16:00', 'Salle 16', '2025-2026'),
('cly-edt-1l-10', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-ang',     'cly-ens-10', 'JEUDI',    '15:00', '16:00', 'Salle 16', '2025-2026'),
('cly-edt-1l-11', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-histgeo', 'cly-ens-12', 'LUNDI',    '14:00', '15:00', 'Salle 17', '2025-2026'),
('cly-edt-1l-12', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-histgeo', 'cly-ens-12', 'MERCREDI', '14:00', '15:00', 'Salle 17', '2025-2026'),
('cly-edt-1l-13', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-svt',     'cly-ens-14', 'LUNDI',    '15:00', '16:00', 'Salle 18', '2025-2026'),
('cly-edt-1l-14', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-eps',     'cly-ens-18', 'MERCREDI', '15:00', '16:00', 'Terrain',  '2025-2026'),
('cly-edt-1l-15', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-philo',   'cly-ens-20', 'MARDI',    '11:15', '12:15', 'Salle 19', '2025-2026'),
('cly-edt-1l-16', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-philo',   'cly-ens-20', 'JEUDI',    '11:15', '12:15', 'Salle 19', '2025-2026'),
('cly-edt-1l-17', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-philo',   'cly-ens-20', 'VENDREDI', '14:00', '15:00', 'Salle 19', '2025-2026'),
('cly-edt-1l-18', 'cly-djibouti-tenant-0001', 'cly-classe-1ere-l', 'cly-mat-info',    'cly-ens-19', 'SAMEDI',   '10:15', '11:15', 'Salle 20', '2025-2026');

-- =========================================================
-- Vérification : aucun conflit prof (même prof, même jour, même heure)
-- =========================================================
SELECT 'CONFLITS PROF' AS check_name, COUNT(*) AS conflits
FROM public.emplois_temps e1
JOIN public.emplois_temps e2
  ON e1."enseignantId" = e2."enseignantId"
  AND e1.jour = e2.jour
  AND e1."heureDebut" = e2."heureDebut"
  AND e1.id < e2.id
WHERE e1."tenantId" = 'cly-djibouti-tenant-0001'

UNION ALL

SELECT 'CONFLITS SALLE', COUNT(*)
FROM public.emplois_temps e1
JOIN public.emplois_temps e2
  ON e1.salle = e2.salle
  AND e1.jour = e2.jour
  AND e1."heureDebut" = e2."heureDebut"
  AND e1.id < e2.id
WHERE e1."tenantId" = 'cly-djibouti-tenant-0001'

UNION ALL

SELECT 'TOTAL CRENEAUX', COUNT(*)
FROM public.emplois_temps
WHERE "tenantId" = 'cly-djibouti-tenant-0001';
