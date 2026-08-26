-- Migration : créer les AffectationEnseignant depuis les EmploiTemps existants.
--
-- Cette migration remplit la table `affectations_enseignants` à partir des
-- entrées d'`emplois_temps` qui ont un `enseignantId`, un `classeId` et un
-- `matiereId`. Elle est idempotente grâce à l'ON CONFLICT DO NOTHING.
--
-- À exécuter après `prisma db push` qui crée la table.

INSERT INTO affectations_enseignants (id, "tenantId", "enseignantId", "classeId", "matiereId", "createdAt")
SELECT
  gen_random_uuid(),
  e."tenantId",
  e."enseignantId",
  e."classeId",
  e."matiereId",
  NOW()
FROM emplois_temps e
WHERE e."enseignantId" IS NOT NULL
  AND e."matiereId" IS NOT NULL
  AND e."classeId" IS NOT NULL
GROUP BY e."tenantId", e."enseignantId", e."classeId", e."matiereId"
ON CONFLICT ("enseignantId", "classeId", "matiereId") DO NOTHING;
