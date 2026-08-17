-- ============================================================
-- 04-calendrier-officiel.sql
-- Calendrier scolaire OFFICIEL de Djibouti (pays = "DJ")
-- Partagé entre tous les tenants djiboutiens.
-- ============================================================
--
-- Ce fichier crée les événements calendaires nationaux (vacances scolaires,
-- examens nationaux, jours fériés) pour le Djibouti. Tous les tenants dont
-- le pays est "DJ" peuvent consulter et importer ces événements.
--
-- Les tenants importent ensuite ces événements dans leur propre
-- EvenementCalendaire (tenant-scoped) au moment de créer leur année scolaire.
-- ============================================================

-- ── Nettoyage préalable (idempotent) ─────────────────────────
DELETE FROM calendriers_officiels WHERE "country" = 'DJ';

-- ── Calendrier officiel Djibouti — 2024-2025 ─────────────────
INSERT INTO calendriers_officiels ("id", "country", "anneeLibelle", "type", "libelle", "dateDebut", "dateFin", "source", "createdAt", "updatedAt") VALUES
  -- Vacances scolaires
  ('cal-dj-2024-toussaint',     'DJ', '2024-2025', 'VACANCE_SCOLAIRE', 'Vacances de la Toussaint',         '2024-10-28 00:00:00', '2024-11-03 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-noel',          'DJ', '2024-2025', 'VACANCE_SCOLAIRE', 'Vacances de Noël',                  '2024-12-21 00:00:00', '2025-01-05 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-printemps',     'DJ', '2024-2025', 'VACANCE_SCOLAIRE', 'Vacances de printemps',             '2025-03-31 00:00:00', '2025-04-06 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-ete',           'DJ', '2024-2025', 'VACANCE_SCOLAIRE', 'Vacances d''été',                   '2025-07-15 00:00:00', '2025-09-14 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  -- Examens nationaux
  ('cal-dj-2024-exam-blanc-t1', 'DJ', '2024-2025', 'EXAMEN',           'Examens blancs 1er trimestre',      '2024-12-09 00:00:00', '2024-12-13 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-exam-blanc-t2', 'DJ', '2024-2025', 'EXAMEN',           'Examens blancs 2ème trimestre',     '2025-03-24 00:00:00', '2025-03-28 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-bfem',          'DJ', '2024-2025', 'EXAMEN',           'BFEM (Brevet de Fin d''Études Moyennes)', '2025-06-02 00:00:00', '2025-06-09 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-bac',           'DJ', '2024-2025', 'EXAMEN',           'Baccalauréat',                      '2025-06-16 00:00:00', '2025-06-23 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  -- Jours fériés
  ('cal-dj-2024-independance',  'DJ', '2024-2025', 'JOUR_FERIE',       'Fête de l''Indépendance',           '2025-06-27 00:00:00', '2025-06-27 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-aid-fitr',      'DJ', '2024-2025', 'JOUR_FERIE',       'Aïd al-Fitr',                       '2025-04-10 00:00:00', '2025-04-10 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-aid-adha',      'DJ', '2024-2025', 'JOUR_FERIE',       'Aïd al-Adha',                       '2025-06-07 00:00:00', '2025-06-07 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2024-nouvel-an',     'DJ', '2024-2025', 'JOUR_FERIE',       'Nouvel An',                         '2025-01-01 00:00:00', '2025-01-01 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- ── Calendrier officiel Djibouti — 2025-2026 ─────────────────
INSERT INTO calendriers_officiels ("id", "country", "anneeLibelle", "type", "libelle", "dateDebut", "dateFin", "source", "createdAt", "updatedAt") VALUES
  -- Vacances scolaires
  ('cal-dj-2025-toussaint',     'DJ', '2025-2026', 'VACANCE_SCOLAIRE', 'Vacances de la Toussaint',         '2025-10-27 00:00:00', '2025-11-02 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-noel',          'DJ', '2025-2026', 'VACANCE_SCOLAIRE', 'Vacances de Noël',                  '2025-12-20 00:00:00', '2026-01-04 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-printemps',     'DJ', '2025-2026', 'VACANCE_SCOLAIRE', 'Vacances de printemps',             '2026-03-28 00:00:00', '2026-04-05 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-ete',           'DJ', '2025-2026', 'VACANCE_SCOLAIRE', 'Vacances d''été',                   '2026-07-14 00:00:00', '2026-09-13 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  -- Examens nationaux
  ('cal-dj-2025-exam-blanc-t1', 'DJ', '2025-2026', 'EXAMEN',           'Examens blancs 1er trimestre',      '2025-12-08 00:00:00', '2025-12-12 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-exam-blanc-t2', 'DJ', '2025-2026', 'EXAMEN',           'Examens blancs 2ème trimestre',     '2026-03-23 00:00:00', '2026-03-27 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-bfem',          'DJ', '2025-2026', 'EXAMEN',           'BFEM (Brevet de Fin d''Études Moyennes)', '2026-06-01 00:00:00', '2026-06-08 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-bac',           'DJ', '2025-2026', 'EXAMEN',           'Baccalauréat',                      '2026-06-15 00:00:00', '2026-06-22 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  -- Jours fériés
  ('cal-dj-2025-independance',  'DJ', '2025-2026', 'JOUR_FERIE',       'Fête de l''Indépendance',           '2026-06-27 00:00:00', '2026-06-27 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-aid-adha',      'DJ', '2025-2026', 'JOUR_FERIE',       'Aïd al-Adha',                       '2026-05-27 00:00:00', '2026-05-27 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00'),
  ('cal-dj-2025-nouvel-an',     'DJ', '2025-2026', 'JOUR_FERIE',       'Nouvel An',                         '2026-01-01 00:00:00', '2026-01-01 00:00:00', 'ministere', '2024-09-01 00:00:00', '2024-09-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;
