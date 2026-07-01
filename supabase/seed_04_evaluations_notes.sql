-- ============================================================
-- SEED 04 — Évaluations (devoirs) + Notes pour le Trimestre 1
-- Chaque classe a des devoirs dans chaque matière (1 à 2 par matière)
-- Les notes sont générées avec random() pour des valeurs réalistes
-- ============================================================

-- ÉVALUATIONS : 1 à 2 devoirs par matière et par classe pour T1
-- 6 classes × 10 matières × ~1.5 devoirs = ~90 évaluations

-- 6ème A
INSERT INTO public.evaluations (id, "tenantId", titre, type, "classeId", "matiereId", "periodeId", date, duree, coefficient, statut, "createdAt", "updatedAt")
VALUES
  ('cly-eval-6a-math-d1', 'cly-djibouti-tenant-0001', 'DS Math n°1 - Fractions', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-math', 'cly-periode-t1', '2025-09-25', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-math-d2', 'cly-djibouti-tenant-0001', 'DS Math n°2 - Géométrie', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-math', 'cly-periode-t1', '2025-11-15', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-fr-d1',   'cly-djibouti-tenant-0001', 'DS Français n°1 - Rédaction', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-fr', 'cly-periode-t1', '2025-09-30', 90, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-fr-d2',   'cly-djibouti-tenant-0001', 'DS Français n°2 - Grammaire', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-fr', 'cly-periode-t1', '2025-11-20', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-ar-d1',   'cly-djibouti-tenant-0001', 'DS Arabe n°1 - Lecture', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-ar', 'cly-periode-t1', '2025-10-05', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-ang-d1',  'cly-djibouti-tenant-0001', 'DS Anglais n°1 - Vocabulary', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-ang', 'cly-periode-t1', '2025-10-12', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-hg-d1',   'cly-djibouti-tenant-0001', 'DS Histoire-Géo n°1', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-histgeo', 'cly-periode-t1', '2025-10-19', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-svt-d1',  'cly-djibouti-tenant-0001', 'DS SVT n°1 - Le vivant', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-svt', 'cly-periode-t1', '2025-11-05', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-phy-d1',  'cly-djibouti-tenant-0001', 'DS Physique n°1 - Matière', 'DEVOIR', 'cly-classe-6eme-a', 'cly-mat-phys', 'cly-periode-t1', '2025-11-10', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-6a-eps-d1',  'cly-djibouti-tenant-0001', 'Éval EPS n°1 - Athlétisme', 'CONTROLE', 'cly-classe-6eme-a', 'cly-mat-eps', 'cly-periode-t1', '2025-10-25', 90, 1, 'TERMINE', NOW(), NOW());

-- 5ème B
INSERT INTO public.evaluations (id, "tenantId", titre, type, "classeId", "matiereId", "periodeId", date, duree, coefficient, statut, "createdAt", "updatedAt")
VALUES
  ('cly-eval-5b-math-d1', 'cly-djibouti-tenant-0001', 'DS Math n°1 - Proportionnalité', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-math', 'cly-periode-t1', '2025-09-26', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-math-d2', 'cly-djibouti-tenant-0001', 'DS Math n°2 - Triangle', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-math', 'cly-periode-t1', '2025-11-16', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-fr-d1',   'cly-djibouti-tenant-0001', 'DS Français n°1 - Conte', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-fr', 'cly-periode-t1', '2025-10-01', 90, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-fr-d2',   'cly-djibouti-tenant-0001', 'DS Français n°2 - Conjugaison', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-fr', 'cly-periode-t1', '2025-11-21', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-ar-d1',   'cly-djibouti-tenant-0001', 'DS Arabe n°1 - Expression', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-ar', 'cly-periode-t1', '2025-10-06', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-ang-d1',  'cly-djibouti-tenant-0001', 'DS Anglais n°1 - Grammar', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-ang', 'cly-periode-t1', '2025-10-13', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-hg-d1',   'cly-djibouti-tenant-0001', 'DS Histoire-Géo n°1 - Afrique', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-histgeo', 'cly-periode-t1', '2025-10-20', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-svt-d1',  'cly-djibouti-tenant-0001', 'DS SVT n°1 - Respiration', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-svt', 'cly-periode-t1', '2025-11-06', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-phy-d1',  'cly-djibouti-tenant-0001', 'DS Physique n°1 - Eau', 'DEVOIR', 'cly-classe-5eme-b', 'cly-mat-phys', 'cly-periode-t1', '2025-11-11', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-5b-eps-d1',  'cly-djibouti-tenant-0001', 'Éval EPS n°1 - Football', 'CONTROLE', 'cly-classe-5eme-b', 'cly-mat-eps', 'cly-periode-t1', '2025-10-26', 90, 1, 'TERMINE', NOW(), NOW());

-- 4ème C
INSERT INTO public.evaluations (id, "tenantId", titre, type, "classeId", "matiereId", "periodeId", date, duree, coefficient, statut, "createdAt", "updatedAt")
VALUES
  ('cly-eval-4c-math-d1', 'cly-djibouti-tenant-0001', 'DS Math n°1 - Puissances', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-math', 'cly-periode-t1', '2025-09-27', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-math-d2', 'cly-djibouti-tenant-0001', 'DS Math n°2 - Théorème Pythagore', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-math', 'cly-periode-t1', '2025-11-17', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-fr-d1',   'cly-djibouti-tenant-0001', 'DS Français n°1 - Poésie', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-fr', 'cly-periode-t1', '2025-10-02', 90, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-fr-d2',   'cly-djibouti-tenant-0001', 'DS Français n°2 - Théâtre', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-fr', 'cly-periode-t1', '2025-11-22', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-ar-d1',   'cly-djibouti-tenant-0001', 'DS Arabe n°1 - Grammaire', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-ar', 'cly-periode-t1', '2025-10-07', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-ang-d1',  'cly-djibouti-tenant-0001', 'DS Anglais n°1 - Reading', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-ang', 'cly-periode-t1', '2025-10-14', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-hg-d1',   'cly-djibouti-tenant-0001', 'DS Histoire-Géo n°1 - Colonisation', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-histgeo', 'cly-periode-t1', '2025-10-21', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-svt-d1',  'cly-djibouti-tenant-0001', 'DS SVT n°1 - Reproduction', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-svt', 'cly-periode-t1', '2025-11-07', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-phy-d1',  'cly-djibouti-tenant-0001', 'DS Physique n°1 - Électricité', 'DEVOIR', 'cly-classe-4eme-c', 'cly-mat-phys', 'cly-periode-t1', '2025-11-12', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-4c-eps-d1',  'cly-djibouti-tenant-0001', 'Éval EPS n°1 - Volleyball', 'CONTROLE', 'cly-classe-4eme-c', 'cly-mat-eps', 'cly-periode-t1', '2025-10-27', 90, 1, 'TERMINE', NOW(), NOW());

-- 3ème D
INSERT INTO public.evaluations (id, "tenantId", titre, type, "classeId", "matiereId", "periodeId", date, duree, coefficient, statut, "createdAt", "updatedAt")
VALUES
  ('cly-eval-3d-math-d1', 'cly-djibouti-tenant-0001', 'DS Math n°1 - Équations', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-math', 'cly-periode-t1', '2025-09-28', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-math-d2', 'cly-djibouti-tenant-0001', 'DS Math n°2 - Fonctions', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-math', 'cly-periode-t1', '2025-11-18', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-fr-d1',   'cly-djibouti-tenant-0001', 'DS Français n°1 - Roman', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-fr', 'cly-periode-t1', '2025-10-03', 90, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-fr-d2',   'cly-djibouti-tenant-0001', 'DS Français n°2 - Argumentation', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-fr', 'cly-periode-t1', '2025-11-23', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-ar-d1',   'cly-djibouti-tenant-0001', 'DS Arabe n°1 - Littérature', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-ar', 'cly-periode-t1', '2025-10-08', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-ang-d1',  'cly-djibouti-tenant-0001', 'DS Anglais n°1 - Writing', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-ang', 'cly-periode-t1', '2025-10-15', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-hg-d1',   'cly-djibouti-tenant-0001', 'DS Histoire-Géo n°1 - Guerres mondiales', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-histgeo', 'cly-periode-t1', '2025-10-22', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-svt-d1',  'cly-djibouti-tenant-0001', 'DS SVT n°1 - Génétique', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-svt', 'cly-periode-t1', '2025-11-08', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-phy-d1',  'cly-djibouti-tenant-0001', 'DS Physique n°1 - Mécanique', 'DEVOIR', 'cly-classe-3eme-d', 'cly-mat-phys', 'cly-periode-t1', '2025-11-13', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-3d-eps-d1',  'cly-djibouti-tenant-0001', 'Éval EPS n°1 - Basketball', 'CONTROLE', 'cly-classe-3eme-d', 'cly-mat-eps', 'cly-periode-t1', '2025-10-28', 90, 1, 'TERMINE', NOW(), NOW());

-- 2nde S
INSERT INTO public.evaluations (id, "tenantId", titre, type, "classeId", "matiereId", "periodeId", date, duree, coefficient, statut, "createdAt", "updatedAt")
VALUES
  ('cly-eval-2s-math-d1', 'cly-djibouti-tenant-0001', 'DS Math n°1 - Fonctions affines', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-math', 'cly-periode-t1', '2025-09-29', 90, 3, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-math-d2', 'cly-djibouti-tenant-0001', 'DS Math n°2 - Vecteurs', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-math', 'cly-periode-t1', '2025-11-19', 90, 3, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-fr-d1',   'cly-djibouti-tenant-0001', 'DS Français n°1 - Tragédie', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-fr', 'cly-periode-t1', '2025-10-04', 120, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-ar-d1',   'cly-djibouti-tenant-0001', 'DS Arabe n°1 - Poésie arabe', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-ar', 'cly-periode-t1', '2025-10-09', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-ang-d1',  'cly-djibouti-tenant-0001', 'DS Anglais n°1 - Essay', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-ang', 'cly-periode-t1', '2025-10-16', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-hg-d1',   'cly-djibouti-tenant-0001', 'DS Histoire-Géo n°1 - Mondialisation', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-histgeo', 'cly-periode-t1', '2025-10-23', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-svt-d1',  'cly-djibouti-tenant-0001', 'DS SVT n°1 - Cellule', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-svt', 'cly-periode-t1', '2025-11-09', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-phy-d1',  'cly-djibouti-tenant-0001', 'DS Physique n°1 - Forces', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-phys', 'cly-periode-t1', '2025-11-14', 90, 3, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-info-d1', 'cly-djibouti-tenant-0001', 'DS Informatique n°1 - Algorithmique', 'DEVOIR', 'cly-classe-2nde-s', 'cly-mat-info', 'cly-periode-t1', '2025-11-25', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-2s-eps-d1',  'cly-djibouti-tenant-0001', 'Éval EPS n°1 - Handball', 'CONTROLE', 'cly-classe-2nde-s', 'cly-mat-eps', 'cly-periode-t1', '2025-10-29', 90, 1, 'TERMINE', NOW(), NOW());

-- 1ère L
INSERT INTO public.evaluations (id, "tenantId", titre, type, "classeId", "matiereId", "periodeId", date, duree, coefficient, statut, "createdAt", "updatedAt")
VALUES
  ('cly-eval-1l-math-d1', 'cly-djibouti-tenant-0001', 'DS Math n°1 - Statistiques', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-math', 'cly-periode-t1', '2025-09-30', 60, 2, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-fr-d1',   'cly-djibouti-tenant-0001', 'DS Français n°1 - Dissertation', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-fr', 'cly-periode-t1', '2025-10-05', 180, 4, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-fr-d2',   'cly-djibouti-tenant-0001', 'DS Français n°2 - Commentaire', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-fr', 'cly-periode-t1', '2025-11-24', 120, 4, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-philo-d1','cly-djibouti-tenant-0001', 'DS Philo n°1 - La conscience', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-philo', 'cly-periode-t1', '2025-10-10', 120, 3, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-ar-d1',   'cly-djibouti-tenant-0001', 'DS Arabe n°1 - Roman arabe', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-ar', 'cly-periode-t1', '2025-10-17', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-ang-d1',  'cly-djibouti-tenant-0001', 'DS Anglais n°1 - Literature', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-ang', 'cly-periode-t1', '2025-10-24', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-hg-d1',   'cly-djibouti-tenant-0001', 'DS Histoire-Géo n°1 - Décolonisation', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-histgeo', 'cly-periode-t1', '2025-11-10', 60, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-svt-d1',  'cly-djibouti-tenant-0001', 'DS SVT n°1 - Écosystèmes', 'DEVOIR', 'cly-classe-1ere-l', 'cly-mat-svt', 'cly-periode-t1', '2025-11-15', 45, 1, 'TERMINE', NOW(), NOW()),
  ('cly-eval-1l-eps-d1',  'cly-djibouti-tenant-0001', 'Éval EPS n°1 - Natation', 'CONTROLE', 'cly-classe-1ere-l', 'cly-mat-eps', 'cly-periode-t1', '2025-10-30', 90, 1, 'TERMINE', NOW(), NOW());

-- ============================================================
-- NOTES : Générées dynamiquement pour chaque élève et chaque évaluation
-- Valeurs entre 6 et 19 sur 20 (réalistes pour un lycée)
-- ============================================================

-- Notes 6ème A (25 élèves × 10 évaluations = 250 notes)
INSERT INTO public.notes (id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId", type, intitule, valeur, "noteMax", coefficient, date, "evaluationId", "isPubliee", "createdAt", "updatedAt")
SELECT
  'cly-note-6a-' || e.id || '-' || el.id,
  'cly-djibouti-tenant-0001',
  el.id,
  'cly-classe-6eme-a',
  e."matiereId",
  'cly-periode-t1',
  e.type,
  e.titre,
  ROUND((6 + RANDOM() * 13)::numeric, 2),
  20,
  e.coefficient,
  e.date,
  e.id,
  true,
  NOW(),
  NOW()
FROM public.evaluations e
CROSS JOIN public.eleves el
WHERE e."classeId" = 'cly-classe-6eme-a' AND el."classeId" = 'cly-classe-6eme-a';

-- Notes 5ème B
INSERT INTO public.notes (id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId", type, intitule, valeur, "noteMax", coefficient, date, "evaluationId", "isPubliee", "createdAt", "updatedAt")
SELECT
  'cly-note-5b-' || e.id || '-' || el.id,
  'cly-djibouti-tenant-0001',
  el.id,
  'cly-classe-5eme-b',
  e."matiereId",
  'cly-periode-t1',
  e.type,
  e.titre,
  ROUND((6 + RANDOM() * 13)::numeric, 2),
  20,
  e.coefficient,
  e.date,
  e.id,
  true,
  NOW(),
  NOW()
FROM public.evaluations e
CROSS JOIN public.eleves el
WHERE e."classeId" = 'cly-classe-5eme-b' AND el."classeId" = 'cly-classe-5eme-b';

-- Notes 4ème C
INSERT INTO public.notes (id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId", type, intitule, valeur, "noteMax", coefficient, date, "evaluationId", "isPubliee", "createdAt", "updatedAt")
SELECT
  'cly-note-4c-' || e.id || '-' || el.id,
  'cly-djibouti-tenant-0001',
  el.id,
  'cly-classe-4eme-c',
  e."matiereId",
  'cly-periode-t1',
  e.type,
  e.titre,
  ROUND((6 + RANDOM() * 13)::numeric, 2),
  20,
  e.coefficient,
  e.date,
  e.id,
  true,
  NOW(),
  NOW()
FROM public.evaluations e
CROSS JOIN public.eleves el
WHERE e."classeId" = 'cly-classe-4eme-c' AND el."classeId" = 'cly-classe-4eme-c';

-- Notes 3ème D
INSERT INTO public.notes (id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId", type, intitule, valeur, "noteMax", coefficient, date, "evaluationId", "isPubliee", "createdAt", "updatedAt")
SELECT
  'cly-note-3d-' || e.id || '-' || el.id,
  'cly-djibouti-tenant-0001',
  el.id,
  'cly-classe-3eme-d',
  e."matiereId",
  'cly-periode-t1',
  e.type,
  e.titre,
  ROUND((6 + RANDOM() * 13)::numeric, 2),
  20,
  e.coefficient,
  e.date,
  e.id,
  true,
  NOW(),
  NOW()
FROM public.evaluations e
CROSS JOIN public.eleves el
WHERE e."classeId" = 'cly-classe-3eme-d' AND el."classeId" = 'cly-classe-3eme-d';

-- Notes 2nde S
INSERT INTO public.notes (id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId", type, intitule, valeur, "noteMax", coefficient, date, "evaluationId", "isPubliee", "createdAt", "updatedAt")
SELECT
  'cly-note-2s-' || e.id || '-' || el.id,
  'cly-djibouti-tenant-0001',
  el.id,
  'cly-classe-2nde-s',
  e."matiereId",
  'cly-periode-t1',
  e.type,
  e.titre,
  ROUND((6 + RANDOM() * 13)::numeric, 2),
  20,
  e.coefficient,
  e.date,
  e.id,
  true,
  NOW(),
  NOW()
FROM public.evaluations e
CROSS JOIN public.eleves el
WHERE e."classeId" = 'cly-classe-2nde-s' AND el."classeId" = 'cly-classe-2nde-s';

-- Notes 1ère L
INSERT INTO public.notes (id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId", type, intitule, valeur, "noteMax", coefficient, date, "evaluationId", "isPubliee", "createdAt", "updatedAt")
SELECT
  'cly-note-1l-' || e.id || '-' || el.id,
  'cly-djibouti-tenant-0001',
  el.id,
  'cly-classe-1ere-l',
  e."matiereId",
  'cly-periode-t1',
  e.type,
  e.titre,
  ROUND((6 + RANDOM() * 13)::numeric, 2),
  20,
  e.coefficient,
  e.date,
  e.id,
  true,
  NOW(),
  NOW()
FROM public.evaluations e
CROSS JOIN public.eleves el
WHERE e."classeId" = 'cly-classe-1ere-l' AND el."classeId" = 'cly-classe-1ere-l';
