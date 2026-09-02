-- ============================================================
-- 03-matieres-salles-tarifs.sql
-- Cité Scolaire Ambouli (Djibouti)
-- 14 Matières partagées (siteId=NULL) + 24 Salles (12 × 2 sites) + 8 Tarifs
-- ============================================================
--
-- IMPORTANT : Les matières sont PARTAGÉES entre tous les sites (siteId = NULL).
-- Le schéma Prisma et le filtre de site (SHARED_NULL_MODELS dans site-scope.ts)
-- sont conçus pour cela : une matière avec siteId=NULL est visible de tous les
-- sites automatiquement. Dupliquer "Français" par site casserait :
--   - l'agrégation des notes (deux matiereId différents pour la même matière)
--   - les bulletins (BulletinMatiere ne peut pas agréger)
--   - le curriculum (Chapitre → Competence pointent vers un seul matiereId)
--   - l'alerte de décalage (les signaux seraient divisés par site)
--   - les analytics inter-sites (impossible de comparer "Français" entre sites)
--
-- Les salles et tarifs restent par site : ce sont des ressources physiques et
-- financières propres à chaque campus.

-- ── Nettoyage préalable (idempotent) ─────────────────────────
DELETE FROM tarifs_niveau WHERE "tenantId" = 'tenant-ambouli';
DELETE FROM salles        WHERE "tenantId" = 'tenant-ambouli';
DELETE FROM matieres      WHERE "tenantId" = 'tenant-ambouli';

-- ── 14 Matières partagées (siteId = NULL) ────────────────────
-- 12 matières collège (communes à tous les sites) + 2 matières lycée extra.
-- Si un site a besoin d'un coefficient différent, créer une matière spécifique
-- à ce site avec un code distinct (ex: "FR-LYCEE") — mais c'est l'exception.
INSERT INTO matieres ("id", "tenantId", "siteId", "nom", "code", "coefficient", "couleur", "niveau") VALUES
  -- 12 matières collège (communes)
  ('mat-MATH',  'tenant-ambouli', NULL, 'Mathématiques',                     'MATH',  5, '#3b82f6', NULL),
  ('mat-FR',    'tenant-ambouli', NULL, 'Français',                          'FR',    5, '#ef4444', NULL),
  ('mat-ANG',   'tenant-ambouli', NULL, 'Anglais',                           'ANG',   4, '#f59e0b', NULL),
  ('mat-AR',    'tenant-ambouli', NULL, 'Arabe',                             'AR',    3, '#10b981', NULL),
  ('mat-HG',    'tenant-ambouli', NULL, 'Histoire-Géographie',               'HG',    3, '#f97316', NULL),
  ('mat-PC',    'tenant-ambouli', NULL, 'Physique-Chimie',                   'PC',    3, '#8b5cf6', NULL),
  ('mat-SVT',   'tenant-ambouli', NULL, 'Sciences de la Vie et de la Terre', 'SVT',   3, '#06b6d4', NULL),
  ('mat-EPS',   'tenant-ambouli', NULL, 'Éducation Physique et Sportive',    'EPS',   1, '#84cc16', NULL),
  ('mat-TECH',  'tenant-ambouli', NULL, 'Technologie',                       'TECH',  2, '#64748b', NULL),
  ('mat-ART',   'tenant-ambouli', NULL, 'Arts Plastiques',                   'ART',   1, '#ec4899', NULL),
  ('mat-MUS',   'tenant-ambouli', NULL, 'Éducation Musicale',                'MUS',   1, '#a855f7', NULL),
  ('mat-ISL',   'tenant-ambouli', NULL, 'Éducation Islamique',               'ISL',   2, '#14b8a6', NULL),
  -- 2 matières lycée extra (communes, niveau "1ère")
  ('mat-PHILO', 'tenant-ambouli', NULL, 'Philosophie',                       'PHILO', 3, '#7c3aed', '1ère'),
  ('mat-SES',   'tenant-ambouli', NULL, 'Sciences Économiques et Sociales',  'SES',   4, '#0ea5e9', '1ère')
ON CONFLICT ("id") DO NOTHING;

-- ── 62 Salles (31 × 2 sites) ────────────────────────────────
-- Une salle attitrée par classe (22 par site) : les élèves y restent et les
-- professeurs se déplacent, l'usage au collège comme au lycée. C'est aussi ce
-- qui rend l'emploi du temps réalisable — une salle de classe n'est occupée
-- que par sa classe et ne peut donc pas entrer en conflit. S'y ajoutent les
-- salles partagées (labos, informatique, installations sportives), que le
-- générateur d'emploi du temps réserve en vérifiant leur disponibilité.
INSERT INTO salles ("id", "tenantId", "siteId", "nom", "capacite", "type", "batiment") VALUES
  -- Site Ambouli (AMB) — une salle attitrée par classe
  ('salle-AMB-salle-101',            'tenant-ambouli', 'site-ambouli', 'Salle 101',                    35, 'cours',        'Bloc A'),  -- 6ème A
  ('salle-AMB-salle-102',            'tenant-ambouli', 'site-ambouli', 'Salle 102',                    35, 'cours',        'Bloc A'),  -- 6ème B
  ('salle-AMB-salle-103',            'tenant-ambouli', 'site-ambouli', 'Salle 103',                    35, 'cours',        'Bloc A'),  -- 6ème C
  ('salle-AMB-salle-104',            'tenant-ambouli', 'site-ambouli', 'Salle 104',                    35, 'cours',        'Bloc A'),  -- 5ème A
  ('salle-AMB-salle-105',            'tenant-ambouli', 'site-ambouli', 'Salle 105',                    35, 'cours',        'Bloc A'),  -- 5ème B
  ('salle-AMB-salle-106',            'tenant-ambouli', 'site-ambouli', 'Salle 106',                    35, 'cours',        'Bloc A'),  -- 5ème C
  ('salle-AMB-salle-107',            'tenant-ambouli', 'site-ambouli', 'Salle 107',                    35, 'cours',        'Bloc B'),  -- 4ème A
  ('salle-AMB-salle-108',            'tenant-ambouli', 'site-ambouli', 'Salle 108',                    35, 'cours',        'Bloc B'),  -- 4ème B
  ('salle-AMB-salle-109',            'tenant-ambouli', 'site-ambouli', 'Salle 109',                    35, 'cours',        'Bloc B'),  -- 4ème C
  ('salle-AMB-salle-110',            'tenant-ambouli', 'site-ambouli', 'Salle 110',                    35, 'cours',        'Bloc B'),  -- 3ème A
  ('salle-AMB-salle-111',            'tenant-ambouli', 'site-ambouli', 'Salle 111',                    35, 'cours',        'Bloc B'),  -- 3ème B
  ('salle-AMB-salle-112',            'tenant-ambouli', 'site-ambouli', 'Salle 112',                    35, 'cours',        'Bloc B'),  -- 3ème C
  ('salle-AMB-salle-201',            'tenant-ambouli', 'site-ambouli', 'Salle 201',                    35, 'cours',        'Bloc C'),  -- 2nde A
  ('salle-AMB-salle-202',            'tenant-ambouli', 'site-ambouli', 'Salle 202',                    35, 'cours',        'Bloc C'),  -- 2nde B
  ('salle-AMB-salle-203',            'tenant-ambouli', 'site-ambouli', 'Salle 203',                    35, 'cours',        'Bloc C'),  -- 2nde C
  ('salle-AMB-salle-204',            'tenant-ambouli', 'site-ambouli', 'Salle 204',                    35, 'cours',        'Bloc C'),  -- 2nde D
  ('salle-AMB-salle-205',            'tenant-ambouli', 'site-ambouli', 'Salle 205',                    35, 'cours',        'Bloc C'),  -- 1ère S
  ('salle-AMB-salle-206',            'tenant-ambouli', 'site-ambouli', 'Salle 206',                    35, 'cours',        'Bloc C'),  -- 1ère ES
  ('salle-AMB-salle-207',            'tenant-ambouli', 'site-ambouli', 'Salle 207',                    35, 'cours',        'Bloc C'),  -- 1ère L
  ('salle-AMB-salle-208',            'tenant-ambouli', 'site-ambouli', 'Salle 208',                    35, 'cours',        'Bloc C'),  -- Terminale S
  ('salle-AMB-salle-209',            'tenant-ambouli', 'site-ambouli', 'Salle 209',                    35, 'cours',        'Bloc C'),  -- Terminale ES
  ('salle-AMB-salle-210',            'tenant-ambouli', 'site-ambouli', 'Salle 210',                    35, 'cours',        'Bloc C'),  -- Terminale L
  ('salle-AMB-labo-physique-1',      'tenant-ambouli', 'site-ambouli', 'Labo Physique Ambouli 1',      25, 'labo',        'Bloc D'),
  ('salle-AMB-labo-physique-2',      'tenant-ambouli', 'site-ambouli', 'Labo Physique Ambouli 2',      25, 'labo',        'Bloc D'),
  ('salle-AMB-labo-svt',             'tenant-ambouli', 'site-ambouli', 'Labo SVT Ambouli',             25, 'labo',        'Bloc D'),
  ('salle-AMB-salle-info',           'tenant-ambouli', 'site-ambouli', 'Salle Info Ambouli',           30, 'informatique','Bloc D'),
  ('salle-AMB-gymnase',              'tenant-ambouli', 'site-ambouli', 'Gymnase Ambouli',              60, 'sport',       'Annexe'),
  ('salle-AMB-terrain-sport',        'tenant-ambouli', 'site-ambouli', 'Terrain de sport Ambouli',     60, 'sport',       'Annexe'),
  ('salle-AMB-plateau-sportif',      'tenant-ambouli', 'site-ambouli', 'Plateau sportif Ambouli',      60, 'sport',       'Annexe'),
  ('salle-AMB-salle-des-professeurs','tenant-ambouli', 'site-ambouli', 'Salle des professeurs Ambouli',40, 'cours',       'Bloc A'),
  ('salle-AMB-cdi',                  'tenant-ambouli', 'site-ambouli', 'CDI Ambouli',                  40, 'cours',       'Bloc B'),
  -- Site Arhiba (ARH) — une salle attitrée par classe
  ('salle-ARH-salle-301',            'tenant-ambouli', 'site-arhiba', 'Salle 301',                    35, 'cours',        'Bloc A'),  -- 6ème A
  ('salle-ARH-salle-302',            'tenant-ambouli', 'site-arhiba', 'Salle 302',                    35, 'cours',        'Bloc A'),  -- 6ème B
  ('salle-ARH-salle-303',            'tenant-ambouli', 'site-arhiba', 'Salle 303',                    35, 'cours',        'Bloc A'),  -- 6ème C
  ('salle-ARH-salle-304',            'tenant-ambouli', 'site-arhiba', 'Salle 304',                    35, 'cours',        'Bloc A'),  -- 5ème A
  ('salle-ARH-salle-305',            'tenant-ambouli', 'site-arhiba', 'Salle 305',                    35, 'cours',        'Bloc A'),  -- 5ème B
  ('salle-ARH-salle-306',            'tenant-ambouli', 'site-arhiba', 'Salle 306',                    35, 'cours',        'Bloc A'),  -- 5ème C
  ('salle-ARH-salle-307',            'tenant-ambouli', 'site-arhiba', 'Salle 307',                    35, 'cours',        'Bloc B'),  -- 4ème A
  ('salle-ARH-salle-308',            'tenant-ambouli', 'site-arhiba', 'Salle 308',                    35, 'cours',        'Bloc B'),  -- 4ème B
  ('salle-ARH-salle-309',            'tenant-ambouli', 'site-arhiba', 'Salle 309',                    35, 'cours',        'Bloc B'),  -- 4ème C
  ('salle-ARH-salle-310',            'tenant-ambouli', 'site-arhiba', 'Salle 310',                    35, 'cours',        'Bloc B'),  -- 3ème A
  ('salle-ARH-salle-311',            'tenant-ambouli', 'site-arhiba', 'Salle 311',                    35, 'cours',        'Bloc B'),  -- 3ème B
  ('salle-ARH-salle-312',            'tenant-ambouli', 'site-arhiba', 'Salle 312',                    35, 'cours',        'Bloc B'),  -- 3ème C
  ('salle-ARH-salle-401',            'tenant-ambouli', 'site-arhiba', 'Salle 401',                    35, 'cours',        'Bloc C'),  -- 2nde A
  ('salle-ARH-salle-402',            'tenant-ambouli', 'site-arhiba', 'Salle 402',                    35, 'cours',        'Bloc C'),  -- 2nde B
  ('salle-ARH-salle-403',            'tenant-ambouli', 'site-arhiba', 'Salle 403',                    35, 'cours',        'Bloc C'),  -- 2nde C
  ('salle-ARH-salle-404',            'tenant-ambouli', 'site-arhiba', 'Salle 404',                    35, 'cours',        'Bloc C'),  -- 2nde D
  ('salle-ARH-salle-405',            'tenant-ambouli', 'site-arhiba', 'Salle 405',                    35, 'cours',        'Bloc C'),  -- 1ère S
  ('salle-ARH-salle-406',            'tenant-ambouli', 'site-arhiba', 'Salle 406',                    35, 'cours',        'Bloc C'),  -- 1ère ES
  ('salle-ARH-salle-407',            'tenant-ambouli', 'site-arhiba', 'Salle 407',                    35, 'cours',        'Bloc C'),  -- 1ère L
  ('salle-ARH-salle-408',            'tenant-ambouli', 'site-arhiba', 'Salle 408',                    35, 'cours',        'Bloc C'),  -- Terminale S
  ('salle-ARH-salle-409',            'tenant-ambouli', 'site-arhiba', 'Salle 409',                    35, 'cours',        'Bloc C'),  -- Terminale ES
  ('salle-ARH-salle-410',            'tenant-ambouli', 'site-arhiba', 'Salle 410',                    35, 'cours',        'Bloc C'),  -- Terminale L
  ('salle-ARH-labo-physique-1',      'tenant-ambouli', 'site-arhiba', 'Labo Physique Arhiba 1',       25, 'labo',        'Bloc D'),
  ('salle-ARH-labo-physique-2',      'tenant-ambouli', 'site-arhiba', 'Labo Physique Arhiba 2',       25, 'labo',        'Bloc D'),
  ('salle-ARH-labo-svt',             'tenant-ambouli', 'site-arhiba', 'Labo SVT Arhiba',              25, 'labo',        'Bloc D'),
  ('salle-ARH-salle-info',           'tenant-ambouli', 'site-arhiba', 'Salle Info Arhiba',            30, 'informatique','Bloc D'),
  ('salle-ARH-gymnase',              'tenant-ambouli', 'site-arhiba', 'Gymnase Arhiba',               60, 'sport',       'Annexe'),
  ('salle-ARH-terrain-sport',        'tenant-ambouli', 'site-arhiba', 'Terrain de sport Arhiba',      60, 'sport',       'Annexe'),
  ('salle-ARH-plateau-sportif',      'tenant-ambouli', 'site-arhiba', 'Plateau sportif Arhiba',       60, 'sport',       'Annexe'),
  ('salle-ARH-salle-des-professeurs','tenant-ambouli', 'site-arhiba', 'Salle des professeurs Arhiba', 40, 'cours',       'Bloc A'),
  ('salle-ARH-cdi',                  'tenant-ambouli', 'site-arhiba', 'CDI Arhiba',                   40, 'cours',       'Bloc B')
ON CONFLICT ("id") DO NOTHING;

-- ── 8 Tarifs (Collège/Lycée × 2 ans × 2 sites) ──────────────
-- Collège: mensualité=15000 DJF | Lycée: mensualité=20000 DJF
INSERT INTO tarifs_niveau ("id", "tenantId", "siteId", "niveau", "annee", "mensualite", "fraisInscription", "fraisRenouvellement", "fraisCantine", "fraisTransport", "devise", "nbMois", "actif", "createdAt", "updatedAt") VALUES
  -- Ambouli — Collège
  ('tarif-coll-AMB-2024-2025', 'tenant-ambouli', 'site-ambouli', 'Collège', '2024-2025', 15000, 10000, 5000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('tarif-coll-AMB-2025-2026', 'tenant-ambouli', 'site-ambouli', 'Collège', '2025-2026', 15000, 10000, 5000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  -- Ambouli — Lycée
  ('tarif-lycee-AMB-2024-2025','tenant-ambouli', 'site-ambouli', 'Lycée',   '2024-2025', 20000, 12000, 6000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('tarif-lycee-AMB-2025-2026','tenant-ambouli', 'site-ambouli', 'Lycée',   '2025-2026', 20000, 12000, 6000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  -- Arhiba — Collège
  ('tarif-coll-ARH-2024-2025', 'tenant-ambouli', 'site-arhiba',  'Collège', '2024-2025', 15000, 10000, 5000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('tarif-coll-ARH-2025-2026', 'tenant-ambouli', 'site-arhiba',  'Collège', '2025-2026', 15000, 10000, 5000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  -- Arhiba — Lycée
  ('tarif-lycee-ARH-2024-2025','tenant-ambouli', 'site-arhiba',  'Lycée',   '2024-2025', 20000, 12000, 6000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('tarif-lycee-ARH-2025-2026','tenant-ambouli', 'site-arhiba',  'Lycée',   '2025-2026', 20000, 12000, 6000, 6000, 4000, 'DJF', 10, TRUE, '2024-09-15 12:00:00', '2024-09-15 12:00:00')
ON CONFLICT ("id") DO NOTHING;
