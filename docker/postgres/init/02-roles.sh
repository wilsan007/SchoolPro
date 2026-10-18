#!/bin/bash
# ============================================================
# SchoolPro — Rôles PostgreSQL au moindre privilège
#
# Pourquoi quatre rôles au lieu d'un ?
# Aujourd'hui l'application se connecte avec le propriétaire du schéma :
# une injection SQL réussie permettrait un `DROP TABLE`. En séparant les
# rôles, le rayon de souffle d'une compromission applicative se limite
# aux données (récupérables par sauvegarde), jamais au schéma.
#
#   schoolpro_owner   propriétaire du schéma, DDL           → migrations seules
#   schoolpro_app     SELECT/INSERT/UPDATE/DELETE, pas DDL  → runtime
#   schoolpro_backup  lecture globale + réplication         → pgBackRest
#   schoolpro_ro      lecture seule                         → diagnostic/analytique
#
# Exécuté une seule fois, au premier démarrage (initdb).
# ============================================================
set -euo pipefail

# Les mots de passe sont fournis par l'environnement (SOPS les déchiffre
# au déploiement). On échoue explicitement s'ils manquent, plutôt que de
# créer des rôles sans mot de passe.
: "${POSTGRES_DB:?POSTGRES_DB requis}"
: "${PG_OWNER_PASSWORD:?PG_OWNER_PASSWORD requis}"
: "${PG_APP_PASSWORD:?PG_APP_PASSWORD requis}"
: "${PG_BACKUP_PASSWORD:?PG_BACKUP_PASSWORD requis}"
: "${PG_RO_PASSWORD:?PG_RO_PASSWORD requis}"

echo "[roles] Création des rôles au moindre privilège..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
-- ============================================================
-- 1. Création des rôles
-- ============================================================
-- NOSUPERUSER / NOCREATEDB / NOCREATEROLE sont explicites : on ne compte
-- pas sur les valeurs par défaut, qui pourraient changer de version en version.

-- Propriétaire du schéma : porte le DDL, utilisé uniquement par
-- \`prisma migrate deploy\` via un job éphémère.
CREATE ROLE schoolpro_owner
  LOGIN PASSWORD '${PG_OWNER_PASSWORD}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  CONNECTION LIMIT 5;

-- Rôle applicatif : le seul utilisé en permanence. Aucun droit DDL.
CREATE ROLE schoolpro_app
  LOGIN PASSWORD '${PG_APP_PASSWORD}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  CONNECTION LIMIT 80;

-- Sauvegarde : lecture de toutes les données + réplication (WAL).
CREATE ROLE schoolpro_backup
  LOGIN PASSWORD '${PG_BACKUP_PASSWORD}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  REPLICATION
  CONNECTION LIMIT 5;

-- Lecture seule : diagnostic, requêtes analytiques, exports ponctuels.
CREATE ROLE schoolpro_ro
  LOGIN PASSWORD '${PG_RO_PASSWORD}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  CONNECTION LIMIT 5;

-- ============================================================
-- 2. Propriété de la base et du schéma
-- ============================================================
-- L'image officielle crée la base au nom du superutilisateur. On la
-- transfère au propriétaire dédié pour que le superutilisateur ne soit
-- plus jamais nécessaire en fonctionnement normal.
ALTER DATABASE ${POSTGRES_DB} OWNER TO schoolpro_owner;
ALTER SCHEMA public OWNER TO schoolpro_owner;

-- Depuis PostgreSQL 15, le schéma public n'est plus inscriptible par
-- PUBLIC. On le confirme : une régression de configuration ne doit pas
-- rouvrir ce droit silencieusement.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE ${POSTGRES_DB} FROM PUBLIC;

-- ============================================================
-- 3. Droits de connexion
-- ============================================================
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO schoolpro_owner, schoolpro_app, schoolpro_backup, schoolpro_ro;

-- USAGE permet de voir les objets du schéma, sans pouvoir en créer.
GRANT USAGE ON SCHEMA public TO schoolpro_app, schoolpro_backup, schoolpro_ro;

-- ============================================================
-- 4. Droits sur les objets EXISTANTS
-- ============================================================
-- Au premier démarrage le schéma est vide (Prisma migrera ensuite), mais
-- ces ordres rendent le script idempotent si on le rejoue sur une base
-- déjà migrée.

-- Runtime : données seulement, jamais de structure.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO schoolpro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO schoolpro_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO schoolpro_app;

-- Sauvegarde et diagnostic : lecture seule.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO schoolpro_backup, schoolpro_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO schoolpro_backup, schoolpro_ro;

-- pg_read_all_data (PostgreSQL 14+) couvre aussi les tables futures et les
-- schémas système, ce dont pgBackRest a besoin sans être superutilisateur.
GRANT pg_read_all_data TO schoolpro_backup;
GRANT pg_read_all_stats TO schoolpro_ro;

-- ============================================================
-- 5. Droits sur les objets FUTURS (le point critique)
-- ============================================================
-- Sans ceci, chaque \`prisma migrate deploy\` créerait des tables
-- inaccessibles à schoolpro_app, et l'application tomberait en erreur après
-- chaque migration. ALTER DEFAULT PRIVILEGES applique les droits
-- automatiquement à tout objet créé PAR schoolpro_owner.
ALTER DEFAULT PRIVILEGES FOR ROLE schoolpro_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO schoolpro_app;
ALTER DEFAULT PRIVILEGES FOR ROLE schoolpro_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO schoolpro_app;
ALTER DEFAULT PRIVILEGES FOR ROLE schoolpro_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO schoolpro_app;

ALTER DEFAULT PRIVILEGES FOR ROLE schoolpro_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO schoolpro_backup, schoolpro_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE schoolpro_owner IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO schoolpro_backup, schoolpro_ro;

-- ============================================================
-- 6. Verrouillage du superutilisateur
-- ============================================================
-- pg_hba.conf refuse déjà \`postgres\` par le réseau. On limite en plus ses
-- connexions simultanées pour qu'un usage anormal soit visible.
ALTER ROLE postgres CONNECTION LIMIT 3;
SQL

echo "[roles] Rôles créés : schoolpro_owner, schoolpro_app, schoolpro_backup, schoolpro_ro"
