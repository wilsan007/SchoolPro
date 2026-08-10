-- Migration : Backfill du siteId des élèves existants depuis leur classe
--
-- Problème : Les élèves créés avant l'implémentation du filtrage par site
-- n'ont pas de siteId renseigné, alors que leur classe en a un.
--
-- Solution : Copier le siteId de la classe vers l'élève quand l'élève
-- n'a pas de siteId mais sa classe en a un.

UPDATE "eleves"
SET "siteId" = c."siteId",
    "updatedAt" = NOW()
FROM "classes" c
WHERE "eleves"."classeId" = c."id"
  AND "eleves"."siteId" IS NULL
  AND c."siteId" IS NOT NULL;

-- Vérification : compter les élèves encore sans siteId
SELECT
  COUNT(*) AS eleves_sans_site,
  (SELECT COUNT(*) FROM "eleves" WHERE "siteId" IS NOT NULL) AS eleves_avec_site
FROM "eleves"
WHERE "siteId" IS NULL;
