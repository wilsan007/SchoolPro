-- ============================================================
-- MANUAL-05 — Réparer l'insertion des migrations Prisma
-- ============================================================
-- À APPLIQUER UNE FOIS sur une base dont `_prisma_migrations` porte une
-- colonne `migration_script NOT NULL`.
--
-- LE PROBLÈME (constaté le 29/09/2026 sur la base Supabase de SchoolPro)
-- `prisma migrate deploy` échouait sur la PREMIÈRE migration à appliquer, avec
-- un message déroutant :
--
--   Error: Failing row contains (fce8d51d-…, 20260912140000_…, null, null,
--   null, c3c99482…, null, 2026-09-29 12:31:54, 0)
--
-- Le message ne dit pas quelle contrainte a été violée. Le diagnostic :
--
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = '_prisma_migrations';
--
--   → migration_script | text | NO | (aucun défaut)
--
-- La colonne `migration_script` est **`NOT NULL` sans valeur par défaut**, et
-- l'engine Prisma ne la renseigne pas : il ne connaît que id, migration_name,
-- checksum, started_at, finished_at, rolled_back_at, logs et
-- applied_steps_count. Chaque insertion échoue donc — et avec elle TOUTE
-- migration, quelle que soit son contenu.
--
-- D'où vient cette colonne ? Elle ne figure nulle part dans le dépôt. Elle a
-- été ajoutée à la main (`owner = postgres`), et elle contient le SQL complet
-- de chaque migration déjà appliquée (25 lignes, jusqu'à 4 552 caractères) —
-- vraisemblablement remplie lors d'une reprise de base pour conserver
-- l'historique des scripts.
--
-- LA RÉPARATION
-- On retire la contrainte, sans toucher aux données : les 25 scripts déjà
-- stockés sont conservés. Les migrations suivantes seront enregistrées comme
-- Prisma le fait nativement, c'est-à-dire sans ce champ.
--
-- Alternative écartée : `SET DEFAULT ''`. Elle rend l'insertion possible mais
-- inscrit une chaîne vide dans une colonne que personne ne lit, et masque le
-- fait que la colonne est orpheline du point de vue de Prisma.
--
-- VÉRIFICATION APRÈS APPLICATION
--   pnpm prisma migrate status    # ne doit plus signaler de migration en échec
--   pnpm prisma migrate deploy    # doit appliquer les migrations en attente
--
-- IDEMPOTENT : rejouable sans effet si la contrainte est déjà retirée.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = '_prisma_migrations'
      AND column_name = 'migration_script'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "_prisma_migrations" ALTER COLUMN "migration_script" DROP NOT NULL;
    RAISE NOTICE 'Contrainte NOT NULL retirée sur _prisma_migrations.migration_script';
  ELSE
    RAISE NOTICE '_prisma_migrations.migration_script déjà nullable — rien à faire';
  END IF;
END $$;