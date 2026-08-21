#!/bin/bash
# ============================================================
# EcolPro — Audit de sécurité : partie base de données
#
# Contrôle que le durcissement PostgreSQL n'a pas dérivé. Une
# configuration se dégrade silencieusement : une migration qui accorde
# trop de droits, un rôle créé pour un dépannage et jamais supprimé, le
# chiffrement désactivé « temporairement »… Ce script transforme ces
# dérives en alerte.
#
# Exécuté chaque lundi par Ofelia. Alerte Telegram si un contrôle critique
# échoue. Code de sortie non nul en cas d'échec critique.
# ============================================================
set -uo pipefail

DB_NAME="${POSTGRES_DB:-ecolpro}"
NOTIFY="/usr/local/bin/notify.sh"
PSQL="psql -U postgres -d ${DB_NAME} -t -A -X -q"

CRITICAL=0
WARNINGS=0
REPORT=""

log()  { echo "[audit-db] $*"; }
add()  { REPORT="${REPORT}$1"$'\n'; }

ok()   { log "  OK      $1"; }
warn() { log "  ALERTE  $1"; add "[!] $1"; WARNINGS=$((WARNINGS + 1)); }
crit() { log "  GRAVE   $1"; add "[GRAVE] $1"; CRITICAL=$((CRITICAL + 1)); }

q() { ${PSQL} -c "$1" 2>/dev/null | tr -d '[:space:]'; }

log "=========================================="
log "Audit sécurité base de données — $(date -u '+%Y-%m-%d %H:%M UTC')"
log "=========================================="

# --- 1. Chiffrement des mots de passe -------------------------------------
log "1. Authentification"
ENC=$(q "SHOW password_encryption;")
if [ "${ENC}" = "scram-sha-256" ]; then
  ok "password_encryption = scram-sha-256"
else
  crit "password_encryption = ${ENC} (attendu scram-sha-256 ; md5 est cassé)"
fi

# Aucun rôle ne doit encore porter un ancien hachage md5.
MD5_ROLES=$(q "SELECT count(*) FROM pg_authid WHERE rolpassword LIKE 'md5%';")
if [ "${MD5_ROLES}" = "0" ]; then
  ok "aucun rôle avec un mot de passe md5"
else
  crit "${MD5_ROLES} rôle(s) utilisent encore un hachage md5"
fi

# --- 2. TLS ---------------------------------------------------------------
log "2. Chiffrement du transport"
SSL=$(q "SHOW ssl;")
if [ "${SSL}" = "on" ]; then
  ok "TLS actif"
else
  crit "TLS désactivé : le trafic entre conteneurs circule en clair"
fi

# --- 3. Superutilisateurs -------------------------------------------------
log "3. Privilèges"
SUPERS=$(q "SELECT string_agg(rolname, ',') FROM pg_roles WHERE rolsuper;")
if [ "${SUPERS}" = "postgres" ]; then
  ok "un seul superutilisateur : postgres"
else
  crit "superutilisateurs inattendus : ${SUPERS}"
fi

# Le rôle applicatif ne doit JAMAIS être superutilisateur ni pouvoir créer
# des rôles : c'est ce qui borne l'impact d'une injection SQL.
APP_SUPER=$(q "SELECT rolsuper::text FROM pg_roles WHERE rolname='ecolpro_app';")
APP_CREATEROLE=$(q "SELECT rolcreaterole::text FROM pg_roles WHERE rolname='ecolpro_app';")
APP_CREATEDB=$(q "SELECT rolcreatedb::text FROM pg_roles WHERE rolname='ecolpro_app';")

[ "${APP_SUPER}" = "false" ] && ok "ecolpro_app n'est pas superutilisateur" \
  || crit "ecolpro_app EST superutilisateur"
[ "${APP_CREATEROLE}" = "false" ] && ok "ecolpro_app ne peut pas créer de rôle" \
  || crit "ecolpro_app peut créer des rôles"
[ "${APP_CREATEDB}" = "false" ] && ok "ecolpro_app ne peut pas créer de base" \
  || crit "ecolpro_app peut créer des bases"

# --- 4. Absence de droits DDL pour le rôle applicatif ---------------------
# Contrôle décisif : si ecolpro_app détient CREATE sur le schéma public, il
# peut créer des objets, donc contourner le modèle de privilèges.
APP_CREATE=$(q "SELECT has_schema_privilege('ecolpro_app','public','CREATE')::text;")
if [ "${APP_CREATE}" = "false" ]; then
  ok "ecolpro_app n'a pas CREATE sur le schéma public"
else
  crit "ecolpro_app a CREATE sur public : il peut modifier le schéma"
fi

# Le propriétaire du schéma doit rester ecolpro_owner.
SCHEMA_OWNER=$(q "SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname='public';")
if [ "${SCHEMA_OWNER}" = "ecolpro_owner" ]; then
  ok "schéma public possédé par ecolpro_owner"
else
  warn "schéma public possédé par ${SCHEMA_OWNER} (attendu ecolpro_owner)"
fi

# --- 5. Tables inaccessibles au rôle applicatif ---------------------------
# Symptôme d'un ALTER DEFAULT PRIVILEGES mal posé : une migration crée des
# tables que l'application ne peut pas lire. L'incident se déclarerait en
# production, à la première requête.
UNREADABLE=$(q "
  SELECT count(*) FROM pg_tables
  WHERE schemaname='public'
    AND NOT has_table_privilege('ecolpro_app', schemaname||'.'||quote_ident(tablename), 'SELECT');
")
if [ "${UNREADABLE}" = "0" ]; then
  ok "toutes les tables sont lisibles par ecolpro_app"
else
  crit "${UNREADABLE} table(s) illisibles par ecolpro_app (privilèges par défaut mal posés)"
fi

# --- 6. Droits accordés à PUBLIC ------------------------------------------
PUBLIC_SCHEMA=$(q "SELECT has_schema_privilege('public','public','CREATE')::text;")
if [ "${PUBLIC_SCHEMA}" = "false" ]; then
  ok "PUBLIC ne peut pas créer dans le schéma public"
else
  crit "PUBLIC peut créer dans le schéma public"
fi

# --- 7. Audit (pgaudit) ---------------------------------------------------
log "4. Traçabilité"
PGAUDIT=$(q "SELECT count(*) FROM pg_extension WHERE extname='pgaudit';")
if [ "${PGAUDIT}" = "1" ]; then
  AUDIT_LOG=$(q "SHOW pgaudit.log;")
  ok "pgaudit actif (log = ${AUDIT_LOG})"
else
  crit "pgaudit inactif : aucune trace des modifications de schéma ni de droits"
fi

# --- 8. Sommes de contrôle des pages -------------------------------------
CHECKSUMS=$(q "SHOW data_checksums;")
if [ "${CHECKSUMS}" = "on" ]; then
  ok "sommes de contrôle des données activées"
else
  warn "data_checksums désactivé : une corruption disque passerait inaperçue"
fi

# --- 9. Fraîcheur des sauvegardes ----------------------------------------
log "5. Sauvegardes"
if pgbackrest --stanza=ecolpro info >/dev/null 2>&1; then
  LAST_TS=$(pgbackrest --stanza=ecolpro info --output=json 2>/dev/null \
    | grep -o '"stop":[0-9]*' | tail -1 | cut -d: -f2)
  if [ -n "${LAST_TS}" ]; then
    AGE_H=$(( ( $(date +%s) - LAST_TS ) / 3600 ))
    if [ "${AGE_H}" -le 26 ]; then
      ok "sauvegarde la plus récente : il y a ${AGE_H} h"
    elif [ "${AGE_H}" -le 72 ]; then
      warn "sauvegarde la plus récente : il y a ${AGE_H} h (attendu < 26 h)"
    else
      crit "sauvegarde la plus récente : il y a ${AGE_H} h — les sauvegardes ne tournent plus"
    fi
  else
    crit "aucune sauvegarde trouvée dans le dépôt"
  fi

  # Un dépôt unique, situé sur la machine à sauvegarder, ne protège pas
  # d'une perte du VPS. On le signale tant que le dépôt hors site est absent.
  if pgbackrest --stanza=ecolpro info --output=json 2>/dev/null | grep -q '"repo":2'; then
    ok "dépôt de sauvegarde hors site configuré"
  else
    warn "AUCUN dépôt hors site : la perte du VPS entraînerait la perte des sauvegardes"
  fi
else
  crit "pgbackrest ne répond pas : état des sauvegardes inconnu"
fi

# --- 10. Archivage des WAL ------------------------------------------------
ARCHIVE_MODE=$(q "SHOW archive_mode;")
if [ "${ARCHIVE_MODE}" = "on" ]; then
  FAILED=$(q "SELECT failed_count FROM pg_stat_archiver;")
  LAST_FAIL=$(q "SELECT COALESCE(last_failed_time::text,'jamais') FROM pg_stat_archiver;")
  if [ "${FAILED}" = "0" ]; then
    ok "archivage des WAL actif, aucun échec"
  else
    warn "archivage des WAL : ${FAILED} échec(s), dernier le ${LAST_FAIL}"
  fi
else
  crit "archive_mode désactivé : la restauration à un instant précis est impossible"
fi

# --- 11. Connexions et transactions bloquées -----------------------------
log "6. Fonctionnement"
IDLE_TX=$(q "SELECT count(*) FROM pg_stat_activity WHERE state='idle in transaction' AND state_change < now() - interval '10 minutes';")
if [ "${IDLE_TX}" = "0" ]; then
  ok "aucune transaction bloquée de longue durée"
else
  warn "${IDLE_TX} transaction(s) inactive(s) depuis plus de 10 min"
fi

# --- Synthèse -------------------------------------------------------------
log "=========================================="
log "Résultat : ${CRITICAL} critique(s), ${WARNINGS} avertissement(s)"
log "=========================================="

if [ "${CRITICAL}" -gt 0 ]; then
  "${NOTIFY}" error "Audit base de données : ${CRITICAL} problème(s) critique(s)" \
    "${REPORT}
Détail complet : docker logs ecolpro-db --tail 200" || true
  exit 1
fi

if [ "${WARNINGS}" -gt 0 ]; then
  "${NOTIFY}" warn "Audit base de données : ${WARNINGS} avertissement(s)" "${REPORT}" || true
fi

exit 0
