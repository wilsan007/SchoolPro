-- ============================================================
-- Migration : add_country_sharing
-- Partage par pays pour Question, Chapitre, Competence, Cours
-- + nouveau modèle CalendrierOfficiel
-- ============================================================
--
-- Principe :
--   tenantId = NULL, country = "DJ" → partagé entre tous les tenants de Djibouti
--   tenantId = "xxx"                → privé au tenant xxx
--
-- Le filtre applicatif (country-scope.ts) génère :
--   WHERE (tenantId = :myTenantId) OR (tenantId IS NULL AND country = :myCountry)
-- ============================================================

-- ── 1. Table : learnos_questions ─────────────────────────────
-- Rendre tenantId nullable + ajouter country
ALTER TABLE "learnos_questions" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "learnos_questions" ADD COLUMN "country" TEXT;
CREATE INDEX "learnos_questions_country_idx" ON "learnos_questions"("country");

-- ── 2. Table : learnos_chapitres ─────────────────────────────
-- Rendre tenantId nullable + ajouter country
ALTER TABLE "learnos_chapitres" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "learnos_chapitres" ADD COLUMN "country" TEXT;
CREATE INDEX "learnos_chapitres_country_idx" ON "learnos_chapitres"("country");

-- ── 3. Table : learnos_competences ───────────────────────────
-- Rendre tenantId nullable + ajouter country
-- + nouvelle contrainte unique [country, code] pour les compétences nationales
ALTER TABLE "learnos_competences" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "learnos_competences" ADD COLUMN "country" TEXT;
CREATE UNIQUE INDEX "learnos_competences_country_code_key" ON "learnos_competences"("country", "code") WHERE "tenantId" IS NULL;
CREATE INDEX "learnos_competences_country_idx" ON "learnos_competences"("country");

-- ── 4. Table : cours ─────────────────────────────────────────
-- Rendre tenantId nullable + ajouter country
ALTER TABLE "cours" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "cours" ADD COLUMN "country" TEXT;
CREATE INDEX "cours_country_idx" ON "cours"("country");

-- ── 5. Nouvelle table : calendriers_officiels ────────────────
-- Événements calendaires nationaux (vacances, examens, jours fériés)
-- partagés entre tous les tenants d'un même pays.
CREATE TABLE "calendriers_officiels" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "anneeLibelle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ministere',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendriers_officiels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendriers_officiels_country_anneeLibelle_idx" ON "calendriers_officiels"("country", "anneeLibelle");
CREATE INDEX "calendriers_officiels_country_anneeLibelle_type_idx" ON "calendriers_officiels"("country", "anneeLibelle", "type");

-- ── 6. Backfill : renseigner country pour les enregistrements existants
-- Les enregistrements existants ont un tenantId ; on renseigne country
-- depuis le tenant auquel ils appartiennent, pour permettre le filtrage.
UPDATE "learnos_questions" q
SET "country" = t."country"
FROM "tenants" t
WHERE q."tenantId" = t."id" AND q."country" IS NULL;

UPDATE "learnos_chapitres" c
SET "country" = t."country"
FROM "tenants" t
WHERE c."tenantId" = t."id" AND c."country" IS NULL;

UPDATE "learnos_competences" c
SET "country" = t."country"
FROM "tenants" t
WHERE c."tenantId" = t."id" AND c."country" IS NULL;

UPDATE "cours" c
SET "country" = t."country"
FROM "tenants" t
WHERE c."tenantId" = t."id" AND c."country" IS NULL;
