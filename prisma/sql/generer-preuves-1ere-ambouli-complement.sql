-- ============================================================
-- COMPLÉMENT : 4ème évaluation par (classe × matière × période)
-- pour atteindre ≥ 4 preuves par compétence avec haute fiabilité
-- ============================================================
-- Le script précédent a généré 3 évaluations (T1=DEVOIR, T2=EXAMEN, T3=QUIZ)
-- mais le T3 (QUIZ, confiance 0.40) ne suffit pas à franchir le seuil de 50%.
-- Ce script ajoute une 4ème évaluation (CONTROLE, confiance 0.75) par
-- (classe × matière × période) pour booster la confiance.
--
-- 3 classes × 10 matières × 3 périodes = 90 évaluations supplémentaires
-- ============================================================

-- ÉTAPE 1 : Créer les évaluations supplémentaires (CONTROLE)

INSERT INTO "evaluations" (
  id, "tenantId", titre, type, "classeId", "matiereId", "periodeId",
  date, duree, coefficient, description, statut, "createdAt", "updatedAt"
)
SELECT
  'eval-comp2-' || c.id || '-' || m.id || '-' || per.id,
  'tenant-ambouli',
  'Contrôle compétences ' || m.code || ' ' || per.nom,
  'CONTROLE'::"TypeNote",
  c.id,
  m.id,
  per.id,
  CASE per.numero
    WHEN 1 THEN '2025-12-01T12:00:00'::timestamp
    WHEN 2 THEN '2026-03-01T12:00:00'::timestamp
    WHEN 3 THEN '2026-06-01T12:00:00'::timestamp
  END,
  60,
  2,
  'Contrôle supplémentaire rattaché à toutes les compétences (génération automatique)',
  'TERMINE',
  NOW(),
  NOW()
FROM "classes" c
CROSS JOIN "matieres" m
CROSS JOIN "periodes" per
WHERE c.id IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
  AND m."tenantId" = 'tenant-ambouli'
  AND per.id IN ('per-y2025-t1-amb', 'per-y2025-t2-amb', 'per-y2025-t3-amb')
ON CONFLICT (id) DO NOTHING;

-- ÉTAPE 2 : Rattacher à toutes les compétences de la matière (1ère)

INSERT INTO "learnos_evaluation_competences" (
  id, "tenantId", "evaluationId", "competenceId", poids, "createdAt"
)
SELECT
  'evcomp2-' || e.id || '-' || comp.id,
  'tenant-ambouli',
  e.id,
  comp.id,
  1,
  NOW()
FROM "evaluations" e
JOIN "matieres" m ON m.id = e."matiereId"
JOIN "learnos_competences" comp ON comp."chapitreId" IN (
  SELECT ch.id FROM "learnos_chapitres" ch
  WHERE ch."matiereId" = m.id AND ch.niveau = '1ere'
)
WHERE e.id LIKE 'eval-comp2-cls-ambouli-2025-1ere-%'
  AND (comp."tenantId" = 'tenant-ambouli' OR comp."tenantId" IS NULL)
ON CONFLICT (id) DO NOTHING;

-- ÉTAPE 3 : Créer les notes

INSERT INTO "notes" (
  id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId",
  type, intitule, valeur, "noteMax", coefficient, date,
  "evaluationId", "isPubliee", "createdAt", "updatedAt"
)
SELECT
  'note-comp2-' || el.id || '-' || e.id,
  'tenant-ambouli',
  el.id,
  e."classeId",
  e."matiereId",
  e."periodeId",
  e.type,
  e.titre,
  GREATEST(0, LEAST(20,
    COALESCE(
      (SELECT AVG(n2.valeur / n2."noteMax") * 20
       FROM "notes" n2
       WHERE n2."eleveId" = el.id AND n2."matiereId" = e."matiereId"
         AND n2."noteMax" > 0),
      10
    )
    + (random() * 4 - 2)
  )),
  20,
  e.coefficient,
  e.date,
  e.id,
  true,
  NOW(),
  NOW()
FROM "evaluations" e
JOIN "eleves" el ON el."classeId" = e."classeId"
WHERE e.id LIKE 'eval-comp2-cls-ambouli-2025-1ere-%'
  AND el."deletedAt" IS NULL
ON CONFLICT (id) DO NOTHING;

-- ÉTAPE 4 : Créer les LearningEvidence

INSERT INTO "learnos_learning_evidences" (
  id, "tenantId", "siteId", "eleveId", "competenceId", "matiereId",
  "sourceType", "sourceId", "noteId", "evaluationId",
  "evidenceType", "rawScore", "maxScore", "occurredAt",
  "masterySignal", "confidence", "weight",
  "errorType", "errorConfidence", "metadata", "createdAt"
)
SELECT
  substr(encode(digest('note' || '|' || n.id || '|' || ec."competenceId", 'sha256'), 'hex'), 1, 24),
  n."tenantId",
  el."siteId",
  n."eleveId",
  ec."competenceId",
  n."matiereId",
  'note',
  n.id,
  n.id,
  n."evaluationId",
  'DEVOIR'::"EvidenceType",
  n.valeur,
  n."noteMax",
  n.date,
  LEAST(1.0, GREATEST(0.0, n.valeur / NULLIF(n."noteMax", 0))),
  0.75 * 1.0,  -- CONTROLE sur 20 : confiance = 0.75
  LEAST(10.0, GREATEST(0.0, COALESCE(n.coefficient, 1) * COALESCE(ec.poids, 1))),
  NULL,
  NULL,
  jsonb_build_object('typeNote', n.type, 'coefficient', n.coefficient, 'genere', true),
  NOW()
FROM "notes" n
JOIN "learnos_evaluation_competences" ec
  ON ec."evaluationId" = n."evaluationId"
  AND ec."tenantId" = n."tenantId"
JOIN "eleves" el ON el.id = n."eleveId"
WHERE n.id LIKE 'note-comp2-%'
ON CONFLICT (id) DO NOTHING;

-- ÉTAPE 5 : Recalculer les profils

DELETE FROM "learnos_student_learning_profiles"
WHERE "eleveId" IN (
  SELECT id FROM "eleves"
  WHERE "classeId" IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
);

INSERT INTO "learnos_student_learning_profiles" (
  id, "tenantId", "siteId", "eleveId", "competenceId",
  "masteryScore", "confidenceScore", "masteryStatus",
  "evidenceCount", "lastEvidenceAt", "trend", "computedAt", "updatedAt"
)
WITH preuves AS (
  SELECT
    "tenantId", "eleveId", "competenceId",
    "masterySignal", "confidence", "weight", "occurredAt", "evidenceType",
    "weight" * "confidence" * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "occurredAt")) / 86400.0) / 90.0) AS poids_effectif,
    CASE WHEN "evidenceType" != 'AUTO_ENTRAINEMENT' THEN true ELSE false END AS supervisee
  FROM "learnos_learning_evidences"
  WHERE "competenceId" IS NOT NULL
    AND "eleveId" IN (
      SELECT id FROM "eleves"
      WHERE "classeId" IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
    )
),
aggrege AS (
  SELECT
    "tenantId", "eleveId", "competenceId",
    COUNT(*) AS evidence_count,
    MAX("occurredAt") AS last_evidence_at,
    CASE WHEN SUM("poids_effectif") > 0
      THEN SUM("masterySignal" * "poids_effectif") / SUM("poids_effectif")
      ELSE 0
    END AS mastery_score,
    1 - EXP(-SUM("poids_effectif") / 2.5) AS confidence_score,
    BOOL_OR("supervisee" AND "poids_effectif" > 0) AS a_supervisee
  FROM preuves
  GROUP BY "tenantId", "eleveId", "competenceId"
),
moities AS (
  SELECT
    "tenantId", "eleveId", "competenceId",
    "masterySignal", "poids_effectif",
    ntile(2) OVER (PARTITION BY "tenantId", "eleveId", "competenceId" ORDER BY "occurredAt") AS moitie,
    COUNT(*) OVER (PARTITION BY "tenantId", "eleveId", "competenceId") AS nb_preuves
  FROM preuves
),
tendances AS (
  SELECT
    "tenantId", "eleveId", "competenceId",
    CASE
      WHEN MAX(nb_preuves) < 4 THEN 'indetermine'
      ELSE
        CASE
          WHEN COALESCE(SUM(CASE WHEN moitie = 2 THEN "masterySignal" * "poids_effectif" ELSE 0 END) / NULLIF(SUM(CASE WHEN moitie = 2 THEN "poids_effectif" ELSE 0 END), 0), 0)
             - COALESCE(SUM(CASE WHEN moitie = 1 THEN "masterySignal" * "poids_effectif" ELSE 0 END) / NULLIF(SUM(CASE WHEN moitie = 1 THEN "poids_effectif" ELSE 0 END), 0), 0)
             > 0.08 THEN 'hausse'
          WHEN COALESCE(SUM(CASE WHEN moitie = 2 THEN "masterySignal" * "poids_effectif" ELSE 0 END) / NULLIF(SUM(CASE WHEN moitie = 2 THEN "poids_effectif" ELSE 0 END), 0), 0)
             - COALESCE(SUM(CASE WHEN moitie = 1 THEN "masterySignal" * "poids_effectif" ELSE 0 END) / NULLIF(SUM(CASE WHEN moitie = 1 THEN "poids_effectif" ELSE 0 END), 0), 0)
             < -0.08 THEN 'baisse'
          ELSE 'stable'
        END
    END AS trend
  FROM moities
  GROUP BY "tenantId", "eleveId", "competenceId"
)
SELECT
  substr(encode(digest(a."eleveId" || ':' || a."competenceId", 'sha256'), 'hex'), 1, 24),
  a."tenantId",
  el."siteId",
  a."eleveId",
  a."competenceId",
  a.mastery_score,
  a.confidence_score,
  CASE
    WHEN a.confidence_score < 0.5 THEN 'UNKNOWN'::"MasteryStatus"
    WHEN a.mastery_score >= 0.55 AND t.trend = 'baisse' THEN 'NEEDS_REVIEW'::"MasteryStatus"
    WHEN a.mastery_score >= 0.8 THEN
      CASE WHEN a.a_supervisee THEN 'MASTERED'::"MasteryStatus" ELSE 'PROFICIENT'::"MasteryStatus" END
    WHEN a.mastery_score >= 0.55 THEN 'PROFICIENT'::"MasteryStatus"
    WHEN a.mastery_score >= 0.35 THEN 'DEVELOPING'::"MasteryStatus"
    ELSE 'EMERGING'::"MasteryStatus"
  END,
  a.evidence_count,
  a.last_evidence_at,
  t.trend,
  NOW(), NOW()
FROM aggrege a
JOIN tendances t ON t."eleveId" = a."eleveId" AND t."competenceId" = a."competenceId"
LEFT JOIN "eleves" el ON el.id = a."eleveId";

-- ÉTAPE 6 : Statistiques

SELECT '=== STATISTIQUES 1ère AMBOULI (après complément) ===' AS info;

SELECT
  "masteryStatus",
  COUNT(*) AS nb
FROM "learnos_student_learning_profiles"
WHERE "eleveId" IN (
  SELECT id FROM "eleves"
  WHERE "classeId" IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
)
GROUP BY "masteryStatus"
ORDER BY
  CASE "masteryStatus"
    WHEN 'MASTERED' THEN 1 WHEN 'PROFICIENT' THEN 2
    WHEN 'DEVELOPING' THEN 3 WHEN 'EMERGING' THEN 4
    WHEN 'NEEDS_REVIEW' THEN 5 WHEN 'UNKNOWN' THEN 6
  END;

SELECT '=== ADEN MOUSSA ===' AS info;

SELECT
  c.code,
  ROUND(p."masteryScore"::numeric * 100, 1) AS pct_mastery,
  ROUND(p."confidenceScore"::numeric * 100, 1) AS pct_confiance,
  p."masteryStatus",
  p."evidenceCount",
  p.trend
FROM "learnos_student_learning_profiles" p
JOIN "learnos_competences" c ON c.id = p."competenceId"
WHERE p."eleveId" = 'ele-ambouli-2025-0527'
ORDER BY p."masteryScore" DESC;
