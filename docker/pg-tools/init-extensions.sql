-- Extensions Postgres pour tests locaux SchoolPro
-- Toutes les extensions sont chargées au démarrage du conteneur

-- pg_stat_statements (déjà préchargé via shared_preload_libraries)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- auto_explain (déjà préchargé via shared_preload_libraries)
-- auto_explain n'est pas une extension CREATE EXTENSION, c'est une lib preload

-- HypoPG — index hypothétiques
CREATE EXTENSION IF NOT EXISTS hypopg;


-- pgTAP — tests unitaires SQL
CREATE EXTENSION IF NOT EXISTS pgtap;


-- pgaudit — audit (déjà préchargé via shared_preload_libraries)
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- amcheck — vérification d'intégrité
CREATE EXTENSION IF NOT EXISTS amcheck;

-- Extensions utilitaires
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE 'Toutes les extensions sont installées sur schoolpro_tools';
END;
$$;

-- plpgsql_check — vérification statique PL/pgSQL (installé via pgxn)
CREATE EXTENSION IF NOT EXISTS plpgsql_check;
