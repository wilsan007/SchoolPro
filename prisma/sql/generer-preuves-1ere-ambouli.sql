-- ============================================================
-- GÉNÉRATION DE PREUVES D'APPRENTISSAGE — 3 CLASSES DE 1ère AMBOULI
-- ============================================================
--
-- Objectif : Atteindre ≥ 4 preuves par (élève × compétence) pour que
-- confidenceScore ≥ 78%, permettant un statut de maîtrise affichable.
--
-- Périmètre : 3 classes de 1ère (S, ES, L) — année 2025-2026 — site Ambouli
--   - 84 élèves (28 × 3 classes)
--   - 60 compétences (6 par matière × 10 matières)
--   - 5 040 combinaisons élève × compétence
--
-- Stratégie :
--   Pour chaque (classe × matière × période), créer 2 évaluations
--   supplémentaires rattachées à TOUTES les compétences de la matière.
--   Cela génère ~4 preuves supplémentaires par combinaison.
--
-- Types de preuves générées :
--   - T1 : DEVOIR (confiance 0.75)
--   - T2 : EXAMEN (confiance 0.90)
--   - T3 : QUIZ (confiance 0.40)
--
-- Usage : psql "$DATABASE_URL" -f prisma/sql/generer-preuves-1ere-ambouli.sql
-- ============================================================

-- Les IDs sont déterministes pour l'idempotence (rejouable)

-- ============================================================
-- ÉTAPE 1 : Créer les nouvelles évaluations
-- ============================================================
-- Pour chaque (classe × matière × période), 1 nouvelle évaluation
-- rattachée à TOUTES les compétences de la matière.
-- 3 classes × 10 matières × 3 périodes = 90 évaluations

INSERT INTO "evaluations" (
  id, "tenantId", titre, type, "classeId", "matiereId", "periodeId",
  date, duree, coefficient, description, statut, "createdAt", "updatedAt"
)
SELECT
  -- ID déterministe : eval-comp-{classeId}-{matiereId}-{periodeId}
  'eval-comp-' || c.id || '-' || m.id || '-' || per.id,
  'tenant-ambouli',
  'Évaluation compétences ' || m.code || ' ' || per.nom,
  -- T1=DEVOIR, T2=EXAMEN, T3=QUIZ
  CASE per.numero
    WHEN 1 THEN 'DEVOIR'::"TypeNote"
    WHEN 2 THEN 'EXAMEN'::"TypeNote"
    WHEN 3 THEN 'INTERROGATION'::"TypeNote"
  END,
  c.id,
  m.id,
  per.id,
  -- Date : au milieu de chaque période
  CASE per.numero
    WHEN 1 THEN '2025-11-15T12:00:00'::timestamp
    WHEN 2 THEN '2026-02-15T12:00:00'::timestamp
    WHEN 3 THEN '2026-05-15T12:00:00'::timestamp
  END,
  CASE per.numero WHEN 2 THEN 120 ELSE 60 END,
  CASE per.numero WHEN 2 THEN 3 ELSE 1 END,
  'Évaluation rattachée à toutes les compétences de la matière (génération automatique)',
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

-- ============================================================
-- ÉTAPE 2 : Rattacher chaque évaluation à TOUTES les compétences
-- de la matière (niveau 1ère)
-- ============================================================

INSERT INTO "learnos_evaluation_competences" (
  id, "tenantId", "evaluationId", "competenceId", poids, "createdAt"
)
SELECT
  -- ID déterministe
  'evcomp-' || e.id || '-' || comp.id,
  'tenant-ambouli',
  e.id,
  comp.id,
  1, -- poids uniforme
  NOW()
FROM "evaluations" e
JOIN "matieres" m ON m.id = e."matiereId"
JOIN "learnos_competences" comp ON comp."chapitreId" IN (
  SELECT ch.id FROM "learnos_chapitres" ch
  WHERE ch."matiereId" = m.id AND ch.niveau = '1ere'
)
WHERE e.id LIKE 'eval-comp-cls-ambouli-2025-1ere-%'
  AND (comp."tenantId" = 'tenant-ambouli' OR comp."tenantId" IS NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ÉTAPE 3 : Créer les notes pour chaque élève
-- ============================================================
-- Le score est basé sur le profil de l'élève (ses notes existantes)
-- avec une variation réaliste.

INSERT INTO "notes" (
  id, "tenantId", "eleveId", "classeId", "matiereId", "periodeId",
  type, intitule, valeur, "noteMax", coefficient, date,
  "evaluationId", "isPubliee", "createdAt", "updatedAt"
)
SELECT
  -- ID déterministe
  'note-comp-' || el.id || '-' || e.id,
  'tenant-ambouli',
  el.id,
  e."classeId",
  e."matiereId",
  e."periodeId",
  e.type,
  e.titre,
  -- Valeur : basée sur la moyenne existante de l'élève dans cette matière
  -- + variation aléatoire (-2 à +2 points)
  GREATEST(0, LEAST(20,
    COALESCE(
      (SELECT AVG(n2.valeur / n2."noteMax") * 20
       FROM "notes" n2
       WHERE n2."eleveId" = el.id AND n2."matiereId" = e."matiereId"
         AND n2."noteMax" > 0),
      10 -- défaut : 10/20 si aucune note existante
    )
    + (random() * 4 - 2) -- variation -2 à +2
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
WHERE e.id LIKE 'eval-comp-cls-ambouli-2025-1ere-%'
  AND el."deletedAt" IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ÉTAPE 4 : Créer les LearningEvidence depuis ces notes
-- ============================================================

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
  CASE n.type
    WHEN 'EXAMEN' THEN 'EXAMEN'::"EvidenceType"
    WHEN 'CONTROLE' THEN 'DEVOIR'::"EvidenceType"
    WHEN 'DEVOIR' THEN 'DEVOIR'::"EvidenceType"
    WHEN 'INTERROGATION' THEN 'QUIZ'::"EvidenceType"
    ELSE 'DEVOIR'::"EvidenceType"
  END,
  n.valeur,
  n."noteMax",
  n.date,
  LEAST(1.0, GREATEST(0.0, n.valeur / NULLIF(n."noteMax", 0))),
  (
    CASE n.type
      WHEN 'EXAMEN' THEN 0.9
      WHEN 'DEVOIR' THEN 0.75
      WHEN 'INTERROGATION' THEN 0.4
      ELSE 0.75
    END
    *
    CASE
      WHEN n."noteMax" >= 20 THEN 1.0
      WHEN n."noteMax" >= 10 THEN 0.9
      WHEN n."noteMax" >= 5 THEN 0.8
      ELSE 0.7
    END
  ),
  LEAST(10.0, GREATEST(0.0, COALESCE(n.coefficient, 1) * COALESCE(ec.poids, 1))),
  NULL,
  NULL,
  jsonb_build_object('typeNote', n.type, 'coefficient', n.coefficient, 'poidsCompetence', ec.poids, 'genere', true),
  NOW()
FROM "notes" n
JOIN "learnos_evaluation_competences" ec
  ON ec."evaluationId" = n."evaluationId"
  AND ec."tenantId" = n."tenantId"
JOIN "eleves" el ON el.id = n."eleveId"
WHERE n.id LIKE 'note-comp-%'
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ÉTAPE 5 : Recalculer les profils (même logique que le script principal)
-- ============================================================

-- Supprimer les anciens profils pour les élèves concernés
DELETE FROM "learnos_student_learning_profiles"
WHERE "eleveId" IN (
  SELECT id FROM "eleves"
  WHERE "classeId" IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
);

-- Recalculer avec toutes les preuves (anciennes + nouvelles)
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

-- ============================================================
-- ÉTAPE 6 : Statistiques
-- ============================================================

SELECT '=== STATISTIQUES 1ère AMBOULI ===' AS info;

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

-- Vérification Aden Moussa
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
