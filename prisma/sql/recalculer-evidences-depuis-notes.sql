-- ============================================================
-- RECALCUL DES EVIDENCES ET PROFILS DEPUIS LES VRAIES NOTES
-- ============================================================
--
-- Le seed initial générait des evidences avec des masteryScore aléatoires
-- (gauss(0.55, 0.2)), déconnectés des notes réelles. Ce script corrige en
-- reconstruisant les evidences à partir des vraies notes, puis en recalculant
-- les profils de maîtrise.
--
-- ÉTAPES :
--   1. Supprime les anciennes evidences AVEC compétence (celles du seed)
--   2. Supprime les anciens profils
--   3. Crée les nouvelles evidences depuis notes × evaluation_competences
--   4. Calcule les profils agrégés (masteryScore pondéré par récence)
--   5. Affiche les statistiques finales
--
-- Usage :
--   psql "$DATABASE_URL" -f prisma/sql/recalculer-evidences-depuis-notes.sql
--   ou via Supabase SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- ÉTAPE 1 : Nettoyage des anciennes données
-- ============================================================

-- Supprimer les anciennes evidences avec compétence (seed aléatoire)
DELETE FROM "learnos_learning_evidences" WHERE "competenceId" IS NOT NULL;

-- Supprimer tous les anciens profils
DELETE FROM "learnos_student_learning_profiles";

-- ============================================================
-- ÉTAPE 2 : Création des evidences depuis les vraies notes
-- ============================================================
-- Pour chaque note rattachée à une évaluation qui a des compétences :
--   masterySignal = valeur / noteMax (normalisé 0..1)
--   confidence    = fiabilité_par_type × facteur_barème
--   weight        = coefficient × poids_competence

-- Constantes de fiabilité par type (synchronisées avec evidence-engine.ts) :
--   EXAMEN=0.9, PROJET=0.8, DEVOIR=0.75, EXERCICE=0.6, RETEST=0.6,
--   ORAL=0.5, QUIZ=0.4, OBSERVATION=0.3, AUTO_ENTRAINEMENT=0.2
-- Facteur barème : >=20→1.0, >=10→0.9, >=5→0.8, sinon→0.7

INSERT INTO "learnos_learning_evidences" (
  id,
  "tenantId",
  "siteId",
  "eleveId",
  "competenceId",
  "matiereId",
  "sourceType",
  "sourceId",
  "noteId",
  "evaluationId",
  "evidenceType",
  "rawScore",
  "maxScore",
  "occurredAt",
  "masterySignal",
  "confidence",
  "weight",
  "errorType",
  "errorConfidence",
  "metadata",
  "createdAt"
)
SELECT
  -- ID déterministe (hash SHA-256 tronqué à 24 chars, comme evidence-engine.ts)
  substr(
    encode(
      digest('note' || '|' || n.id || '|' || ec."competenceId", 'sha256'),
      'hex'
    ),
    1, 24
  ),
  n."tenantId",
  el."siteId",
  n."eleveId",
  ec."competenceId",
  n."matiereId",
  'note',
  n.id,
  n.id,
  n."evaluationId",
  -- evidenceType : mapping identique à evidenceTypeFromNote()
  CASE n.type
    WHEN 'EXAMEN'       THEN 'EXAMEN'::"EvidenceType"
    WHEN 'CONTROLE'     THEN 'DEVOIR'::"EvidenceType"
    WHEN 'DEVOIR'       THEN 'DEVOIR'::"EvidenceType"
    WHEN 'INTERROGATION' THEN 'QUIZ'::"EvidenceType"
    WHEN 'PROJET'       THEN 'PROJET'::"EvidenceType"
    WHEN 'ORAL'         THEN 'ORAL'::"EvidenceType"
    WHEN 'TP'           THEN 'EXERCICE'::"EvidenceType"
    ELSE 'DEVOIR'::"EvidenceType"
  END,
  n.valeur,
  n."noteMax",
  n.date,
  -- masterySignal = valeur / noteMax, borné [0, 1]
  LEAST(1.0, GREATEST(0.0, n.valeur / NULLIF(n."noteMax", 0))),
  -- confidence = fiabilité_type × facteur_barème
  (
    CASE n.type
      WHEN 'EXAMEN'       THEN 0.9
      WHEN 'PROJET'       THEN 0.8
      WHEN 'CONTROLE'     THEN 0.75
      WHEN 'DEVOIR'       THEN 0.75
      WHEN 'TP'           THEN 0.6
      WHEN 'ORAL'         THEN 0.5
      WHEN 'INTERROGATION' THEN 0.4
      ELSE 0.75
    END
    *
    CASE
      WHEN n."noteMax" >= 20 THEN 1.0
      WHEN n."noteMax" >= 10 THEN 0.9
      WHEN n."noteMax" >= 5  THEN 0.8
      ELSE 0.7
    END
  ),
  -- weight = coefficient × poids_competence, borné [0, 10]
  LEAST(10.0, GREATEST(0.0, COALESCE(n.coefficient, 1) * COALESCE(ec.poids, 1))),
  NULL,  -- errorType
  NULL,  -- errorConfidence
  jsonb_build_object(
    'typeNote', n.type,
    'coefficient', n.coefficient,
    'poidsCompetence', ec.poids
  ),
  NOW()
FROM "notes" n
JOIN "learnos_evaluation_competences" ec
  ON ec."evaluationId" = n."evaluationId"
  AND ec."tenantId" = n."tenantId"
-- Récupérer le siteId depuis l'élève (l'évaluation n'a pas de siteId)
LEFT JOIN "eleves" el ON el.id = n."eleveId"
WHERE n."evaluationId" IS NOT NULL
  AND n."noteMax" > 0;

-- ============================================================
-- ÉTAPE 3 : Calcul des profils agrégés
-- ============================================================
-- Pour chaque (eleveId, competenceId) :
--   masteryScore    = Σ(signal × weight × confidence × poidsRecence) / Σ(weight × confidence × poidsRecence)
--   confidenceScore = 1 - exp(-poidsTotal / 2.5)
--   masteryStatus   = dérivé du score + confiance + tendance
--   trend           = comparaison moitié récente vs ancienne
--
-- Constantes :
--   DEMI_VIE_JOURS = 90, SATURATION_CONFIANCE = 2.5, CONFIANCE_MINIMALE = 0.5
--   SEUILS : emergent=0.35, enDeveloppement=0.55, acquis=0.8
--   PREUVES_MIN_TENDANCE = 4, SEUIL_TENDANCE = 0.08

INSERT INTO "learnos_student_learning_profiles" (
  id,
  "tenantId",
  "siteId",
  "eleveId",
  "competenceId",
  "masteryScore",
  "confidenceScore",
  "masteryStatus",
  "evidenceCount",
  "lastEvidenceAt",
  "trend",
  "computedAt",
  "updatedAt"
)
WITH preuves AS (
  SELECT
    "tenantId",
    "eleveId",
    "competenceId",
    "masterySignal",
    "confidence",
    "weight",
    "occurredAt",
    "evidenceType",
    -- Poids de récence : pow(0.5, jours / 90)
    -- Une preuve d'il y a 90 jours pèse moitié moins qu'aujourd'hui
    power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "occurredAt")) / 86400.0) / 90.0) AS poids_recence,
    -- Poids effectif = weight × confidence × poids_recence
    "weight" * "confidence" * power(0.5, GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "occurredAt")) / 86400.0) / 90.0) AS poids_effectif,
    -- Au moins une preuve supervisée (pas AUTO_ENTRAINEMENT)
    CASE WHEN "evidenceType" != 'AUTO_ENTRAINEMENT' THEN true ELSE false END AS supervisee
  FROM "learnos_learning_evidences"
  WHERE "competenceId" IS NOT NULL
),
aggrege AS (
  SELECT
    "tenantId",
    "eleveId",
    "competenceId",
    COUNT(*) AS evidence_count,
    MAX("occurredAt") AS last_evidence_at,
    -- masteryScore = Σ(signal × poids_effectif) / Σ(poids_effectif)
    CASE
      WHEN SUM("poids_effectif") > 0
        THEN SUM("masterySignal" * "poids_effectif") / SUM("poids_effectif")
      ELSE 0
    END AS mastery_score,
    -- confidenceScore = 1 - exp(-poidsTotal / 2.5)
    1 - EXP(-SUM("poids_effectif") / 2.5) AS confidence_score,
    -- Au moins une preuve supervisée avec poids > 0
    BOOL_OR("supervisee" AND "poids_effectif" > 0) AS a_supervisee,
    -- Pour la tendance : on a besoin de la moitié récente vs ancienne
    -- On utilise row_number pour diviser en deux moitiés
    SUM("poids_effectif") AS poids_total
  FROM preuves
  GROUP BY "tenantId", "eleveId", "competenceId"
),
-- Calcul de la tendance : diviser les preuves en 2 moitiés (ancienne/récente)
-- avec ntile(2) sur la date, puis comparer les moyennes pondérées
moities AS (
  SELECT
    "tenantId",
    "eleveId",
    "competenceId",
    "masterySignal",
    "poids_effectif",
    -- ntile(2) = 1 pour la première moitié (ancienne), 2 pour la seconde (récente)
    ntile(2) OVER (PARTITION BY "tenantId", "eleveId", "competenceId" ORDER BY "occurredAt") AS moitie,
    -- Compter le total de preuves par groupe pour le seuil < 4
    COUNT(*) OVER (PARTITION BY "tenantId", "eleveId", "competenceId") AS nb_preuves
  FROM preuves
),
tendances AS (
  SELECT
    "tenantId",
    "eleveId",
    "competenceId",
    CASE
      WHEN MAX(nb_preuves) < 4 THEN 'indetermine'
      ELSE
        CASE
          WHEN
            -- Moyenne pondérée moitié récente (moitie=2)
            COALESCE(
              SUM(CASE WHEN moitie = 2 THEN "masterySignal" * "poids_effectif" ELSE 0 END)
              / NULLIF(SUM(CASE WHEN moitie = 2 THEN "poids_effectif" ELSE 0 END), 0),
              0
            )
            -
            -- Moyenne pondérée moitié ancienne (moitie=1)
            COALESCE(
              SUM(CASE WHEN moitie = 1 THEN "masterySignal" * "poids_effectif" ELSE 0 END)
              / NULLIF(SUM(CASE WHEN moitie = 1 THEN "poids_effectif" ELSE 0 END), 0),
              0
            )
            > 0.08 THEN 'hausse'
          WHEN
            COALESCE(
              SUM(CASE WHEN moitie = 2 THEN "masterySignal" * "poids_effectif" ELSE 0 END)
              / NULLIF(SUM(CASE WHEN moitie = 2 THEN "poids_effectif" ELSE 0 END), 0),
              0
            )
            -
            COALESCE(
              SUM(CASE WHEN moitie = 1 THEN "masterySignal" * "poids_effectif" ELSE 0 END)
              / NULLIF(SUM(CASE WHEN moitie = 1 THEN "poids_effectif" ELSE 0 END), 0),
              0
            )
            < -0.08 THEN 'baisse'
          ELSE 'stable'
        END
    END AS trend
  FROM moities
  GROUP BY "tenantId", "eleveId", "competenceId"
)
SELECT
  -- ID : hash déterministe de (eleveId, competenceId)
  substr(encode(digest(a."eleveId" || ':' || a."competenceId", 'sha256'), 'hex'), 1, 24),
  a."tenantId",
  el."siteId",
  a."eleveId",
  a."competenceId",
  a.mastery_score,
  a.confidence_score,
  -- masteryStatus : dérivé du score, confiance, tendance
  CASE
    -- Confiance insuffisante → UNKNOWN
    WHEN a.confidence_score < 0.5 THEN 'UNKNOWN'::"MasteryStatus"
    -- Acquis mais en baisse → NEEDS_REVIEW
    WHEN a.mastery_score >= 0.55 AND t.trend = 'baisse' THEN 'NEEDS_REVIEW'::"MasteryStatus"
    -- Mastered (si supervisé) ou Proficient (si non supervisé)
    WHEN a.mastery_score >= 0.8 THEN
      CASE WHEN a.a_supervisee THEN 'MASTERED'::"MasteryStatus" ELSE 'PROFICIENT'::"MasteryStatus" END
    -- Proficient
    WHEN a.mastery_score >= 0.55 THEN 'PROFICIENT'::"MasteryStatus"
    -- Developing
    WHEN a.mastery_score >= 0.35 THEN 'DEVELOPING'::"MasteryStatus"
    -- Emerging
    ELSE 'EMERGING'::"MasteryStatus"
  END AS mastery_status,
  a.evidence_count,
  a.last_evidence_at,
  t.trend,
  NOW(),
  NOW()
FROM aggrege a
JOIN tendances t
  ON t."tenantId" = a."tenantId"
  AND t."eleveId" = a."eleveId"
  AND t."competenceId" = a."competenceId"
-- Récupérer le siteId depuis l'élève
LEFT JOIN "eleves" el ON el.id = a."eleveId";

-- ============================================================
-- ÉTAPE 4 : Statistiques finales
-- ============================================================

SELECT '=== STATISTIQUES FINALES ===' AS info;

SELECT
  "masteryStatus",
  COUNT(*) AS nb
FROM "learnos_student_learning_profiles"
GROUP BY "masteryStatus"
ORDER BY
  CASE "masteryStatus"
    WHEN 'MASTERED' THEN 1
    WHEN 'PROFICIENT' THEN 2
    WHEN 'DEVELOPING' THEN 3
    WHEN 'EMERGING' THEN 4
    WHEN 'NEEDS_REVIEW' THEN 5
    WHEN 'UNKNOWN' THEN 6
  END;

SELECT
  ROUND(AVG("masteryScore")::numeric * 100, 1) AS pct_mastery_moyen,
  COUNT(*) AS total_profils
FROM "learnos_student_learning_profiles";

-- Vérification : Aden Moussa (AMB-2025-0527)
SELECT '=== ADEN MOUSSA (AMB-2025-0527) ===' AS info;

SELECT
  c.code,
  ROUND(p."masteryScore"::numeric * 100, 1) AS pct_mastery,
  p."masteryStatus",
  p."evidenceCount",
  p.trend
FROM "learnos_student_learning_profiles" p
JOIN "learnos_competences" c ON c.id = p."competenceId"
JOIN "eleves" e ON e.id = p."eleveId"
WHERE e.matricule = 'AMB-2025-0527'
ORDER BY p."masteryScore" DESC
LIMIT 10;

COMMIT;
