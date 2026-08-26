-- Migration : unicité des structures par site
--
-- Objectif : garantir qu'un site ne peut pas avoir deux structures du même type
-- (ex: deux PRIMAIRE pour le même site). L'unicité existante (tenantId, siteId, type)
-- couvre déjà le cas où siteId est non-null, mais PostgreSQL traite les NULL comme
-- distincts dans les contraintes UNIQUE classiques, ce qui permettrait plusieurs
-- structures "partagées" (siteId IS NULL) du même type pour un même tenant.
--
-- On ajoute donc un index UNIQUE PARTIEL pour le cas siteId IS NULL, afin de
-- garantir une seule structure partagée par type par tenant.

-- 1. Index unique partiel pour les structures partagées (siteId IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS structures_tenant_type_shared_uniq
  ON public.structures ("tenantId", "type")
  WHERE "siteId" IS NULL;

-- Note : l'unicité pour siteId non-null est déjà couverte par la contrainte
-- @@unique([tenantId, siteId, type]) du schéma Prisma (clé composite).
 