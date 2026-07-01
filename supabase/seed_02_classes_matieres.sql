-- ============================================================
-- SEED 02 — 6 Classes + Matières
-- ============================================================

-- 6 Classes
INSERT INTO public.classes (id, "tenantId", nom, niveau, filiere, "effectifMax", annee)
VALUES
  ('cly-classe-6eme-a', 'cly-djibouti-tenant-0001', '6ème A', '6ème', 'Général', 40, '2025-2026'),
  ('cly-classe-5eme-b', 'cly-djibouti-tenant-0001', '5ème B', '5ème', 'Général', 40, '2025-2026'),
  ('cly-classe-4eme-c', 'cly-djibouti-tenant-0001', '4ème C', '4ème', 'Général', 40, '2025-2026'),
  ('cly-classe-3eme-d', 'cly-djibouti-tenant-0001', '3ème D', '3ème', 'Général', 40, '2025-2026'),
  ('cly-classe-2nde-s', 'cly-djibouti-tenant-0001', '2nde S', 'Seconde', 'Scientifique', 40, '2025-2026'),
  ('cly-classe-1ere-l', 'cly-djibouti-tenant-0001', '1ère L', 'Première', 'Littéraire', 40, '2025-2026');

-- Matières (10 matières communes)
INSERT INTO public.matieres (id, "tenantId", nom, code, coefficient, couleur, niveau)
VALUES
  ('cly-mat-math',      'cly-djibouti-tenant-0001', 'Mathématiques',   'MATH', 4.0, '#4f46e5', NULL),
  ('cly-mat-fr',        'cly-djibouti-tenant-0001', 'Français',        'FR',   4.0, '#dc2626', NULL),
  ('cly-mat-ar',        'cly-djibouti-tenant-0001', 'Arabe',           'AR',   2.0, '#16a34a', NULL),
  ('cly-mat-ang',       'cly-djibouti-tenant-0001', 'Anglais',         'ANG',  2.0, '#2563eb', NULL),
  ('cly-mat-histgeo',   'cly-djibouti-tenant-0001', 'Histoire-Géographie', 'HG', 2.0, '#f59e0b', NULL),
  ('cly-mat-svt',       'cly-djibouti-tenant-0001', 'SVT',             'SVT',  2.0, '#059669', NULL),
  ('cly-mat-phys',      'cly-djibouti-tenant-0001', 'Physique-Chimie', 'PHY',  3.0, '#7c3aed', NULL),
  ('cly-mat-eps',       'cly-djibouti-tenant-0001', 'EPS',             'EPS',  1.0, '#ea580c', NULL),
  ('cly-mat-info',      'cly-djibouti-tenant-0001', 'Informatique',    'INFO', 1.0, '#0891b2', NULL),
  ('cly-mat-philo',     'cly-djibouti-tenant-0001', 'Philosophie',     'PHILO',2.0, '#be185d', NULL);
