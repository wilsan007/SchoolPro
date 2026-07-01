-- ============================================================
-- SEED 05 — Absences + Incidents (générés dynamiquement)
-- ============================================================

-- ABSENCES : ~30% des élèves ont au moins une absence au T1
-- Types : INJUSTIFIE, MALADIE, FAMILIALE, TRANSPORT

INSERT INTO public.absences (id, "tenantId", "eleveId", date, "isRetard", motif, statut, "createdAt", "updatedAt")
SELECT
  'cly-abs-' || el.id || '-001',
  'cly-djibouti-tenant-0001',
  el.id,
  (DATE '2025-09-01' + (RANDOM() * 100)::int),
  (RANDOM() < 0.3),
  CASE (RANDOM() * 4)::int
    WHEN 0 THEN 'INJUSTIFIE'::"MotifAbsence"
    WHEN 1 THEN 'MALADIE'::"MotifAbsence"
    WHEN 2 THEN 'FAMILIALE'::"MotifAbsence"
    ELSE 'TRANSPORT'::"MotifAbsence"
  END,
  CASE (RANDOM() * 3)::int
    WHEN 0 THEN 'EN_ATTENTE'::"StatutAbsence"
    WHEN 1 THEN 'JUSTIFIEE'::"StatutAbsence"
    ELSE 'INJUSTIFIEE'::"StatutAbsence"
  END,
  NOW(),
  NOW()
FROM public.eleves el
WHERE el."tenantId" = 'cly-djibouti-tenant-0001'
  AND RANDOM() < 0.3;

-- Quelques absences supplémentaires (2e absence pour certains)
INSERT INTO public.absences (id, "tenantId", "eleveId", date, "isRetard", motif, statut, "createdAt", "updatedAt")
SELECT
  'cly-abs-' || el.id || '-002',
  'cly-djibouti-tenant-0001',
  el.id,
  (DATE '2025-10-15' + (RANDOM() * 60)::int),
  (RANDOM() < 0.4),
  CASE (RANDOM() * 4)::int
    WHEN 0 THEN 'INJUSTIFIE'::"MotifAbsence"
    WHEN 1 THEN 'MALADIE'::"MotifAbsence"
    WHEN 2 THEN 'FAMILIALE'::"MotifAbsence"
    ELSE 'TRANSPORT'::"MotifAbsence"
  END,
  CASE (RANDOM() * 3)::int
    WHEN 0 THEN 'EN_ATTENTE'::"StatutAbsence"
    WHEN 1 THEN 'JUSTIFIEE'::"StatutAbsence"
    ELSE 'INJUSTIFIEE'::"StatutAbsence"
  END,
  NOW(),
  NOW()
FROM public.eleves el
WHERE el."tenantId" = 'cly-djibouti-tenant-0001'
  AND RANDOM() < 0.15;

-- INCIDENTS : ~15% des élèves ont un incident
INSERT INTO public.incidents (id, "tenantId", "eleveId", type, statut, gravite, description, lieu, date, "createdAt", "updatedAt")
SELECT
  'cly-inc-' || el.id || '-001',
  'cly-djibouti-tenant-0001',
  el.id,
  CASE (RANDOM() * 7)::int
    WHEN 0 THEN 'RETARD'::"TypeIncident"
    WHEN 1 THEN 'BAVARDAGE'::"TypeIncident"
    WHEN 2 THEN 'INSOLENCE'::"TypeIncident"
    WHEN 3 THEN 'BAGARRE'::"TypeIncident"
    WHEN 4 THEN 'TRICHE'::"TypeIncident"
    WHEN 5 THEN 'ABSENTEISME'::"TypeIncident"
    ELSE 'AUTRE'::"TypeIncident"
  END,
  CASE (RANDOM() * 3)::int
    WHEN 0 THEN 'OUVERT'::"StatutIncident"
    WHEN 1 THEN 'EN_TRAITEMENT'::"StatutIncident"
    ELSE 'RESOLU'::"StatutIncident"
  END,
  (RANDOM() * 2 + 1)::int,
  CASE (RANDOM() * 5)::int
    WHEN 0 THEN 'Retard répété en cours de mathématiques'
    WHEN 1 THEN 'Bavardage perturbant le cours de français'
    WHEN 2 THEN 'Insolence envers l''enseignant'
    WHEN 3 THEN 'Bagarre dans la cour de récréation'
    ELSE 'Triche détectée lors d''un devoir surveillé'
  END,
  CASE (RANDOM() * 3)::int
    WHEN 0 THEN 'Salle de classe'
    WHEN 1 THEN 'Cour de récréation'
    ELSE 'Couloir'
  END,
  (DATE '2025-09-15' + (RANDOM() * 90)::int),
  NOW(),
  NOW()
FROM public.eleves el
WHERE el."tenantId" = 'cly-djibouti-tenant-0001'
  AND RANDOM() < 0.15;

-- Vérification des compteurs
SELECT 'Tenants' AS table_name, COUNT(*) AS count FROM public.tenants
UNION ALL SELECT 'Users', COUNT(*) FROM public.users
UNION ALL SELECT 'Annees_scolaires', COUNT(*) FROM public.annees_scolaires
UNION ALL SELECT 'Periodes', COUNT(*) FROM public.periodes
UNION ALL SELECT 'Classes', COUNT(*) FROM public.classes
UNION ALL SELECT 'Matieres', COUNT(*) FROM public.matieres
UNION ALL SELECT 'Eleves', COUNT(*) FROM public.eleves
UNION ALL SELECT 'Evaluations', COUNT(*) FROM public.evaluations
UNION ALL SELECT 'Notes', COUNT(*) FROM public.notes
UNION ALL SELECT 'Absences', COUNT(*) FROM public.absences
UNION ALL SELECT 'Incidents', COUNT(*) FROM public.incidents;
