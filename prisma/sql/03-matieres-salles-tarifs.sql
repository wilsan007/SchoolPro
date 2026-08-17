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

-- ── 24 Salles (12 × 2 sites) ────────────────────────────────
INSERT INTO salles ("id", "tenantId", "siteId", "nom", "capacite", "type", "batiment") VALUES
  -- Site Ambouli (AMB)
  ('salle-AMB-salle-101',           'tenant-ambouli', 'site-ambouli', 'Salle 101',              35, 'cours',         'Bloc A'),
  ('salle-AMB-salle-102',           'tenant-ambouli', 'site-ambouli', 'Salle 102',              35, 'cours',         'Bloc A'),
  ('salle-AMB-salle-103',           'tenant-ambouli', 'site-ambouli', 'Salle 103',              35, 'cours',         'Bloc A'),
  ('salle-AMB-salle-201',           'tenant-ambouli', 'site-ambouli', 'Salle 201',              35, 'cours',         'Bloc B'),
  ('salle-AMB-salle-202',           'tenant-ambouli', 'site-ambouli', 'Salle 202',              35, 'cours',         'Bloc B'),
  ('salle-AMB-salle-203',           'tenant-ambouli', 'site-ambouli', 'Salle 203',              35, 'cours',         'Bloc B'),
  ('salle-AMB-labo-physique',       'tenant-ambouli', 'site-ambouli', 'Labo Physique',          25, 'labo',          'Bloc C'),
  ('salle-AMB-labo-svt',            'tenant-ambouli', 'site-ambouli', 'Labo SVT',               25, 'labo',          'Bloc C'),
  ('salle-AMB-salle-info',          'tenant-ambouli', 'site-ambouli', 'Salle Info',             30, 'informatique',  'Bloc C'),
  ('salle-AMB-gymnase',             'tenant-ambouli', 'site-ambouli', 'Gymnase',                60, 'sport',         'Annexe'),
  ('salle-AMB-salle-des-professeurs','tenant-ambouli','site-ambouli', 'Salle des professeurs',  40, 'cours',         'Bloc A'),
  ('salle-AMB-cdi',                 'tenant-ambouli', 'site-ambouli', 'CDI',                    40, 'cours',         'Bloc B'),
  -- Site Arhiba (ARH)
  ('salle-ARH-salle-101',           'tenant-ambouli', 'site-arhiba', 'Salle 101',              35, 'cours',         'Bloc A'),
  ('salle-ARH-salle-102',           'tenant-ambouli', 'site-arhiba', 'Salle 102',              35, 'cours',         'Bloc A'),
  ('salle-ARH-salle-103',           'tenant-ambouli', 'site-arhiba', 'Salle 103',              35, 'cours',         'Bloc A'),
  ('salle-ARH-salle-201',           'tenant-ambouli', 'site-arhiba', 'Salle 201',              35, 'cours',         'Bloc B'),
  ('salle-ARH-salle-202',           'tenant-ambouli', 'site-arhiba', 'Salle 202',              35, 'cours',         'Bloc B'),
  ('salle-ARH-salle-203',           'tenant-ambouli', 'site-arhiba', 'Salle 203',              35, 'cours',         'Bloc B'),
  ('salle-ARH-labo-physique',       'tenant-ambouli', 'site-arhiba', 'Labo Physique',          25, 'labo',          'Bloc C'),
  ('salle-ARH-labo-svt',            'tenant-ambouli', 'site-arhiba', 'Labo SVT',               25, 'labo',          'Bloc C'),
  ('salle-ARH-salle-info',          'tenant-ambouli', 'site-arhiba', 'Salle Info',             30, 'informatique',  'Bloc C'),
  ('salle-ARH-gymnase',             'tenant-ambouli', 'site-arhiba', 'Gymnase',                60, 'sport',         'Annexe'),
  ('salle-ARH-salle-des-professeurs','tenant-ambouli','site-arhiba', 'Salle des professeurs',  40, 'cours',         'Bloc A'),
  ('salle-ARH-cdi',                 'tenant-ambouli', 'site-arhiba', 'CDI',                    40, 'cours',         'Bloc B')
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
