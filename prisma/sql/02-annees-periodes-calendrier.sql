-- ============================================================
-- 02-annees-periodes-calendrier.sql
-- Cité Scolaire Ambouli (Djibouti)
-- 2 Années scolaires + 6 Périodes + 14 Événements calendaires
-- ============================================================

-- ── Nettoyage préalable (idempotent) ─────────────────────────
DELETE FROM evenements_calendaires WHERE "anneeId" IN ('annee-2024-amb','annee-2025-amb');
DELETE FROM periodes               WHERE "anneeId" IN ('annee-2024-amb','annee-2025-amb');
DELETE FROM annees_scolaires       WHERE "tenantId" = 'tenant-ambouli';

-- ── 2 Années scolaires ──────────────────────────────────────
INSERT INTO annees_scolaires ("id", "tenantId", "libelle", "dateDebut", "dateFin", "isCurrent", "statut", "cloturedAt") VALUES
  (
    'annee-2024-amb',
    'tenant-ambouli',
    '2024-2025',
    '2024-09-15 00:00:00',
    '2025-07-15 00:00:00',
    FALSE,
    'CLOTUREE',
    '2025-07-20 12:00:00'
  ),
  (
    'annee-2025-amb',
    'tenant-ambouli',
    '2025-2026',
    '2025-09-15 00:00:00',
    '2026-07-15 00:00:00',
    FALSE,
    'CLOTUREE',
    '2026-07-20 12:00:00'
  ),
  (
    'annee-2026-amb',
    'tenant-ambouli',
    '2026-2027',
    '2026-09-15 00:00:00',
    '2027-07-15 00:00:00',
    TRUE,
    'OUVERTE',
    NULL
  )
ON CONFLICT ("id") DO NOTHING;

-- ── 6 Périodes (3 trimestres × 2 ans) ───────────────────────
INSERT INTO periodes ("id", "anneeId", "nom", "numero", "dateDebut", "dateFin", "isCurrent", "statut") VALUES
  -- 2024-2025 (clôturée)
  ('per-y2024-t1-amb', 'annee-2024-amb', '1er Trimestre 2024-2025',  1, '2024-09-15 00:00:00', '2024-12-20 00:00:00', FALSE, 'CLOTUREE'),
  ('per-y2024-t2-amb', 'annee-2024-amb', '2ème Trimestre 2024-2025', 2, '2025-01-06 00:00:00', '2025-03-28 00:00:00', FALSE, 'CLOTUREE'),
  ('per-y2024-t3-amb', 'annee-2024-amb', '3ème Trimestre 2024-2025', 3, '2025-04-07 00:00:00', '2025-07-15 00:00:00', FALSE, 'CLOTUREE'),
  -- 2025-2026 (clôturée)
  ('per-y2025-t1-amb', 'annee-2025-amb', '1er Trimestre 2025-2026',  1, '2025-09-15 00:00:00', '2025-12-19 00:00:00', FALSE, 'CLOTUREE'),
  ('per-y2025-t2-amb', 'annee-2025-amb', '2ème Trimestre 2025-2026', 2, '2026-01-05 00:00:00', '2026-03-27 00:00:00', FALSE, 'CLOTUREE'),
  ('per-y2025-t3-amb', 'annee-2025-amb', '3ème Trimestre 2025-2026', 3, '2026-04-06 00:00:00', '2026-07-14 00:00:00', FALSE, 'CLOTUREE'),
  -- 2026-2027 (courante)
  ('per-y2026-t1-amb', 'annee-2026-amb', '1er Trimestre 2026-2027',  1, '2026-09-15 00:00:00', '2026-12-19 00:00:00', TRUE,  'OUVERTE'),
  ('per-y2026-t2-amb', 'annee-2026-amb', '2ème Trimestre 2026-2027', 2, '2027-01-05 00:00:00', '2027-03-27 00:00:00', FALSE, 'PREVUE'),
  ('per-y2026-t3-amb', 'annee-2026-amb', '3ème Trimestre 2026-2027', 3, '2027-04-06 00:00:00', '2027-07-14 00:00:00', FALSE, 'PREVUE')
ON CONFLICT ("id") DO NOTHING;

-- ── 14 Événements calendaires ───────────────────────────────
-- Types: VACANCE_SCOLAIRE | EXAMEN | JOUR_FERIE
INSERT INTO evenements_calendaires ("id", "anneeId", "type", "libelle", "dateDebut", "dateFin", "createdAt", "updatedAt") VALUES
  -- 2024-2025
  ('cal-2024-toussaint',     'annee-2024-amb', 'VACANCE_SCOLAIRE', 'Vacances de la Toussaint',         '2024-10-28 00:00:00', '2024-11-03 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2024-noel',          'annee-2024-amb', 'VACANCE_SCOLAIRE', 'Vacances de Noël',                  '2024-12-21 00:00:00', '2025-01-05 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2024-independance',  'annee-2024-amb', 'JOUR_FERIE',       'Fête de l''Indépendance',           '2025-06-27 00:00:00', '2025-06-27 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2024-exam-blanc-t1', 'annee-2024-amb', 'EXAMEN',           'Examens blancs 1er trimestre',      '2024-12-09 00:00:00', '2024-12-13 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2024-bfem',          'annee-2024-amb', 'EXAMEN',           'BFEM (3ème)',                       '2025-06-02 00:00:00', '2025-06-09 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2024-bac',           'annee-2024-amb', 'EXAMEN',           'Baccalauréat',                      '2025-06-16 00:00:00', '2025-06-23 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2024-aid-fitr',      'annee-2024-amb', 'JOUR_FERIE',       'Aïd al-Fitr',                       '2025-04-10 00:00:00', '2025-04-10 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  -- 2025-2026
  ('cal-2025-toussaint',     'annee-2025-amb', 'VACANCE_SCOLAIRE', 'Vacances de la Toussaint',         '2025-10-27 00:00:00', '2025-11-02 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2025-noel',          'annee-2025-amb', 'VACANCE_SCOLAIRE', 'Vacances de Noël',                  '2025-12-20 00:00:00', '2026-01-04 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2025-printemps',     'annee-2025-amb', 'VACANCE_SCOLAIRE', 'Vacances de printemps',             '2026-03-28 00:00:00', '2026-04-05 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2025-exam-blanc-t1', 'annee-2025-amb', 'EXAMEN',           'Examens blancs 1er trimestre',      '2025-12-08 00:00:00', '2025-12-12 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2025-exam-blanc-t2', 'annee-2025-amb', 'EXAMEN',           'Examens blancs 2ème trimestre',     '2026-03-23 00:00:00', '2026-03-27 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2025-aid-adha',      'annee-2025-amb', 'JOUR_FERIE',       'Aïd al-Adha',                       '2026-05-27 00:00:00', '2026-05-27 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00'),
  ('cal-2025-independance',  'annee-2025-amb', 'JOUR_FERIE',       'Fête de l''Indépendance',           '2026-06-27 00:00:00', '2026-06-27 00:00:00', '2024-09-15 12:00:00', '2024-09-15 12:00:00')
ON CONFLICT ("id") DO NOTHING;
