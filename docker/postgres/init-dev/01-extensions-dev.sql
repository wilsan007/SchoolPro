-- ============================================================
-- EcolPro — Extensions PostgreSQL, base de développement locale
-- Exécuté une seule fois, au premier démarrage (initdb).
--
-- Volontairement un sous-ensemble de docker/postgres/init/01-extensions.sql
-- (la production) : `pgaudit` et `pg_stat_statements` exigent d'être
-- préchargés via `shared_preload_libraries` dans postgresql.conf, ce que
-- l'image `postgres:17-alpine` standard ne fait pas. Aucun des deux n'a
-- d'utilité sur une base jetable de développement — pas de vraies
-- requêtes à surveiller.
-- ============================================================

-- pgcrypto : gen_random_uuid(), utilisé par les migrations SQL du projet.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm : recherche floue sur les noms d'élèves.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gin : index combinés, filtres multi-critères.
CREATE EXTENSION IF NOT EXISTS btree_gin;
