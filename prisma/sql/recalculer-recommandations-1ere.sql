-- ============================================================
-- RECALCUL DES RECOMMANDATIONS — 3 CLASSES DE 1ère AMBOULI
-- ============================================================
-- Les profils ont été recalculés, mais les recommandations ne sont
-- normalement générées que par l'event bus (note.recorded). Comme nous
-- avons inséré les preuves directement en SQL, il faut recalculer les
-- recommandations manuellement.
--
-- Ce script :
--   1. Supprime les anciennes recommandations des élèves de 1ère
--   2. Pour chaque (élève × compétence), évalue la bande et crée la reco
--   3. Calcule les prérequis manquants et les compétences bloquées
--
-- Usage : psql "$DATABASE_URL" -f prisma/sql/recalculer-recommandations-1ere.sql
-- ============================================================

-- Nettoyer les anciennes recommandations
DELETE FROM "learnos_recommandations"
WHERE "eleveId" IN (
  SELECT id FROM "eleves"
  WHERE "classeId" IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
);

-- ============================================================
-- Calcul des recommandations
-- ============================================================
-- Seuils par défaut (alignés sur SEUILS_PAR_DEFAUT) :
--   seuilCritique: 0.35, seuilFragile: 0.55, seuilConsolide: 0.8, seuilAvance: 0.92
--   confianceMinimale: 0.5, prerequisBloquantsMin: 2

INSERT INTO "learnos_recommandations" (
  id, "tenantId", "siteId", "eleveId", "competenceId",
  niveau, statut, motif, "regleDeclenchee", "actionProposee",
  "motifParams", "prerequisManquants", "competencesBloquees",
  "createdAt", "updatedAt"
)
WITH profils AS (
  SELECT
    p."tenantId",
    p."siteId",
    p."eleveId",
    p."competenceId",
    p."masteryScore",
    p."confidenceScore",
    p.trend,
    p."prerequisiteStatus",
    c.libelle,
    c.code,
    ch.niveau AS niveau_classe,
    ch."matiereId"
  FROM "learnos_student_learning_profiles" p
  JOIN "learnos_competences" c ON c.id = p."competenceId"
  LEFT JOIN "learnos_chapitres" ch ON ch.id = c."chapitreId"
  WHERE p."eleveId" IN (
    SELECT id FROM "eleves"
    WHERE "classeId" IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
  )
),
-- Évaluer la bande (niveau de recommandation)
bandes AS (
  SELECT
    "tenantId", "siteId", "eleveId", "competenceId",
    "masteryScore", "confidenceScore", trend,
    "prerequisiteStatus", libelle, code, niveau_classe, "matiereId",
    CASE
      -- Confiance insuffisante → pas de recommandation
      WHEN "confidenceScore" < 0.5 THEN NULL
      -- Bandes
      WHEN "masteryScore" < 0.35 THEN 'CRITIQUE'::"NiveauRecommandation"
      WHEN "masteryScore" < 0.55 THEN 'FRAGILE'::"NiveauRecommandation"
      WHEN "masteryScore" < 0.8 THEN NULL  -- CONSOLIDE : pas de reco
      WHEN "masteryScore" < 0.92 THEN 'AVANCE'::"NiveauRecommandation"
      ELSE 'EXCELLENCE'::"NiveauRecommandation"
    END AS niveau
  FROM profils
),
-- Compter les compétences en aval (que cette compétence conditionne)
-- Parcours transitif sur le graphe de prérequis
bloquees AS (
  SELECT
    b."competenceId",
    b."tenantId",
    -- Compter les compétences qui ont celle-ci dans leurs prérequis (direct ou transitif)
    -- Pour simplifier en SQL, on compte les dépendances directes + 1 niveau
    (
      -- B = prérequis, A = dépendante. En aval = celles qui ont celle-ci comme prérequis
      SELECT COUNT(DISTINCT dep.id)
      FROM "_CompetencePrerequis" cp
      JOIN "learnos_competences" dep ON dep.id = cp.A
      WHERE cp.B = b."competenceId"
        AND (dep."tenantId" = b."tenantId" OR dep."tenantId" IS NULL)
    ) AS nb_bloquees
  FROM bandes b
  WHERE b.niveau IS NOT NULL
)
SELECT
  -- ID déterministe
  substr(encode(digest(b."eleveId" || ':' || b."competenceId", 'sha256'), 'hex'), 1, 24),
  b."tenantId",
  b."siteId",
  b."eleveId",
  b."competenceId",
  b.niveau,
  -- Statut : CRITIQUE + ≥2 bloquées → OBLIGATOIRE, sinon RECOMMANDEE ou PROPOSEE
  CASE
    WHEN b.niveau = 'CRITIQUE' AND COALESCE(bl.nb_bloquees, 0) >= 2 THEN 'OBLIGATOIRE'::"StatutRecommandation"
    WHEN b.niveau = 'CRITIQUE' THEN 'RECOMMANDEE'::"StatutRecommandation"
    WHEN b.niveau = 'FRAGILE' THEN 'RECOMMANDEE'::"StatutRecommandation"
    WHEN b.niveau IN ('AVANCE', 'EXCELLENCE') THEN 'PROPOSEE'::"StatutRecommandation"
  END,
  -- Motif
  CASE
    WHEN b.niveau = 'CRITIQUE' THEN
      '« ' || b.libelle || ' » n''est pas acquise' ||
      CASE WHEN COALESCE(bl.nb_bloquees, 0) > 0
        THEN ', et conditionne ' || bl.nb_bloquees || ' compétence(s) à venir.'
        ELSE '.'
      END
    WHEN b.niveau = 'FRAGILE' THEN
      '« ' || b.libelle || ' » est en cours d''acquisition, mais reste instable.'
    WHEN b.niveau = 'AVANCE' THEN
      '« ' || b.libelle || ' » est solidement acquise.'
    WHEN b.niveau = 'EXCELLENCE' THEN
      '« ' || b.libelle || ' » est maîtrisée au-delà des attendus.'
  END,
  -- Règle déclenchée
  CASE
    WHEN b.niveau = 'CRITIQUE' THEN 'critique_sans_prerequis'
    WHEN b.niveau = 'FRAGILE' THEN 'fragile_consolidation'
    WHEN b.niveau = 'AVANCE' THEN 'avance_approfondissement'
    WHEN b.niveau = 'EXCELLENCE' THEN 'excellence_enrichissement'
  END,
  -- Action proposée
  CASE
    WHEN b.niveau = 'CRITIQUE' THEN
      'Reprise ciblée de « ' || b.libelle || ' ».'
    WHEN b.niveau = 'FRAGILE' THEN
      'Consolidation de « ' || b.libelle || ' » par des exercices ciblés.'
    WHEN b.niveau = 'AVANCE' THEN
      'Approfondissement proposé sur « ' || b.libelle || ' ».'
    WHEN b.niveau = 'EXCELLENCE' THEN
      'Défi ou tutorat sur « ' || b.libelle || ' » — de quoi entretenir l''engagement.'
  END,
  -- motifParams
  jsonb_build_object('competence', b.libelle, 'bloquees', COALESCE(bl.nb_bloquees, 0)),
  -- prerequisManquants (vide pour l'instant, sera enrichi par le moteur)
  '[]'::jsonb,
  -- competencesBloquees
  COALESCE(bl.nb_bloquees, 0),
  NOW(), NOW()
FROM bandes b
LEFT JOIN bloquees bl ON bl."competenceId" = b."competenceId" AND bl."tenantId" = b."tenantId"
WHERE b.niveau IS NOT NULL;

-- ============================================================
-- Enrichir avec les prérequis manquants
-- ============================================================
-- Pour chaque compétence CRITIQUE, vérifier si ses prérequis sont acquis

UPDATE "learnos_recommandations" r
SET "prerequisManquants" = sub.manquants
FROM (
  SELECT
    r2.id,
    r2."eleveId",
    r2."competenceId",
    jsonb_agg(
      jsonb_build_object(
        'competenceId', prereq.id,
        'code', prereq.code,
        'libelle', prereq.libelle,
        'masteryScore', COALESCE(prof."masteryScore", 0),
        'acquis', false
      )
    ) AS manquants
  FROM "learnos_recommandations" r2
  -- A = compétence qui a des prérequis, B = le prérequis lui-même
  JOIN "_CompetencePrerequis" cp ON cp.A = r2."competenceId"
  JOIN "learnos_competences" prereq ON prereq.id = cp.B
  -- Vérifier le profil de l'élève sur ce prérequis
  LEFT JOIN "learnos_student_learning_profiles" prof
    ON prof."eleveId" = r2."eleveId"
    AND prof."competenceId" = prereq.id
  WHERE r2.niveau = 'CRITIQUE'
    AND (
      prof."masteryScore" IS NULL
      OR prof."masteryScore" < 0.55
      OR prof."masteryStatus" = 'UNKNOWN'
    )
  GROUP BY r2.id, r2."eleveId", r2."competenceId"
) sub
WHERE r.id = sub.id;

-- ============================================================
-- Statistiques
-- ============================================================

SELECT '=== RECOMMANDATIONS 1ère AMBOULI ===' AS info;

SELECT
  niveau,
  statut,
  COUNT(*) AS nb
FROM "learnos_recommandations"
WHERE "eleveId" IN (
  SELECT id FROM "eleves"
  WHERE "classeId" IN ('cls-ambouli-2025-1ere-S', 'cls-ambouli-2025-1ere-ES', 'cls-ambouli-2025-1ere-L')
)
GROUP BY niveau, statut
ORDER BY
  CASE niveau
    WHEN 'CRITIQUE' THEN 1 WHEN 'FRAGILE' THEN 2
    WHEN 'AVANCE' THEN 3 WHEN 'EXCELLENCE' THEN 4
  END,
  statut;

-- Hodan (élève faible)
SELECT '=== HODAN BARKAT (6.5/20) ===' AS info;

SELECT
  c.code,
  r.niveau,
  r.statut,
  r.motif,
  r."actionProposee",
  r."competencesBloquees",
  CASE WHEN r."prerequisManquants" != '[]'::jsonb THEN r."prerequisManquants"::text ELSE 'aucun' END AS prerequis
FROM "learnos_recommandations" r
JOIN "learnos_competences" c ON c.id = r."competenceId"
WHERE r."eleveId" = 'ele-ambouli-2025-0520'
ORDER BY
  CASE r.niveau WHEN 'CRITIQUE' THEN 1 WHEN 'FRAGILE' THEN 2 WHEN 'AVANCE' THEN 3 WHEN 'EXCELLENCE' THEN 4 END;

-- Aden (bon élève)
SELECT '=== ADEN MOUSSA (16/20) ===' AS info;

SELECT
  c.code,
  r.niveau,
  r.statut,
  r.motif
FROM "learnos_recommandations" r
JOIN "learnos_competences" c ON c.id = r."competenceId"
WHERE r."eleveId" = 'ele-ambouli-2025-0527'
ORDER BY
  CASE r.niveau WHEN 'CRITIQUE' THEN 1 WHEN 'FRAGILE' THEN 2 WHEN 'AVANCE' THEN 3 WHEN 'EXCELLENCE' THEN 4 END;
