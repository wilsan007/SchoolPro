-- ============================================================
-- EcolPro — Extensions PostgreSQL
-- Exécuté une seule fois, au premier démarrage (initdb).
-- ============================================================

-- pgcrypto : gen_random_uuid(), utilisé par les migrations SQL du projet
-- (prisma/migration_supabase.sql et migration_user_roles.sql).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgaudit : journal d'audit. La bibliothèque est préchargée par
-- postgresql.conf (shared_preload_libraries), mais l'extension doit
-- aussi être déclarée dans la base pour être active.
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- pg_stat_statements : identifie les requêtes coûteuses. Sans lui, le
-- diagnostic d'une lenteur se fait à l'aveugle.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- pg_trgm : recherche floue sur les noms d'élèves (LIKE '%dupont%' devient
-- indexable). Utile dès quelques milliers d'élèves.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- btree_gin : index combinés sur des colonnes de types différents, pour les
-- filtres multi-critères (tenant + site + année scolaire).
CREATE EXTENSION IF NOT EXISTS btree_gin;
