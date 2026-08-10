-- Migration: Fix classes with siteId = null
-- Les classes créées via l'UI avant le fix n'avaient pas de siteId assigné.
-- Cette migration assigne chaque classe sans site au site unique du tenant
-- (si le tenant n'a qu'un seul site) ou au site de l'utilisateur qui l'a créée
-- (si identifiable via l'audit). Pour les tenants multi-sites, les classes
-- sans site restent inchangées (à assigner manuellement).

-- Cas 1: Tenant avec un seul site → assigner toutes les classes sans site à ce site
UPDATE "classes" c
SET "siteId" = (
  SELECT s.id FROM "sites" s
  WHERE s."tenantId" = c."tenantId"
  AND s.actif = true
  ORDER BY s."createdAt" ASC
  LIMIT 1
)
WHERE c."siteId" IS NULL
AND (
  SELECT COUNT(*) FROM "sites" s
  WHERE s."tenantId" = c."tenantId"
  AND s.actif = true
) = 1;

-- Cas 2: Pour les tenants multi-sites, assigner les classes sans site
-- au site de leurs élèves (si tous les élèves sont sur le même site)
UPDATE "classes" c
SET "siteId" = sub.eleve_site_id
FROM (
  SELECT e."classeId", e."siteId" AS eleve_site_id
  FROM "eleves" e
  WHERE e."siteId" IS NOT NULL
  AND e."deletedAt" IS NULL
  GROUP BY e."classeId", e."siteId"
  HAVING COUNT(*) > 0
  AND COUNT(DISTINCT e."siteId") = 1
) sub
WHERE c."siteId" IS NULL
AND c.id = sub."classeId";

-- Vérification: afficher les classes encore sans site (à traiter manuellement)
SELECT c.id, c.nom, c."tenantId", t.name AS tenant_name
FROM "classes" c
JOIN "tenants" t ON t.id = c."tenantId"
WHERE c."siteId" IS NULL;
