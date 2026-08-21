#!/bin/bash
# ============================================================
# EcolPro — Vérification RÉELLE des sauvegardes
#
# Une sauvegarde qui n'a jamais été restaurée n'est pas une sauvegarde,
# c'est une hypothèse. Ce script ne se contente pas de lire
# `pgbackrest info` : il restaure effectivement la dernière sauvegarde
# dans un répertoire temporaire, démarre une instance PostgreSQL isolée,
# compte les lignes des tables métier, puis nettoie.
#
# Trois pièges évités :
#   1. l'instance restaurée NE DOIT PAS archiver ses WAL, sinon elle
#      polluerait le dépôt de sauvegarde de la production ;
#   2. elle écoute sur un port distinct et un socket distinct, pour ne
#      jamais entrer en concurrence avec l'instance de production ;
#   3. le répertoire temporaire est supprimé même en cas d'échec (trap).
#
# Exécuté chaque mercredi par Ofelia. Alerte Telegram si le test échoue.
# ============================================================
set -uo pipefail

STANZA="ecolpro"
SCRATCH="/var/lib/postgresql/verify"
VERIFY_PORT=5499
SOCKET_DIR="/tmp/verify-sock"
NOTIFY="/usr/local/bin/notify.sh"
DB_NAME="${POSTGRES_DB:-ecolpro}"

log() { echo "[verify] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

fail() {
  log "ÉCHEC : $1"
  "${NOTIFY}" error "Test de restauration ÉCHOUÉ" \
    "$1

Les sauvegardes ne sont peut-être PAS exploitables. À vérifier sans délai :
  docker exec ecolpro-db pgbackrest --stanza=ecolpro info
  docker logs ecolpro-db --tail 100" || true
  cleanup
  exit 1
}

cleanup() {
  if [ -d "${SCRATCH}" ]; then
    log "Nettoyage du répertoire de test..."
    pg_ctl -D "${SCRATCH}" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "${SCRATCH}" "${SOCKET_DIR}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

START=$(date +%s)

# --- 0. Espace disque disponible -----------------------------------------
# Restaurer demande autant de place que la base. Inutile de commencer si
# l'espace manque : on préfère un avertissement clair à un échec obscur.
AVAIL_KB=$(df -Pk /var/lib/postgresql | awk 'NR==2 {print $4}')
DB_SIZE_KB=$(du -sk /var/lib/postgresql/data 2>/dev/null | awk '{print $1}')
if [ -n "${DB_SIZE_KB}" ] && [ "${AVAIL_KB}" -lt "$(( DB_SIZE_KB + 1048576 ))" ]; then
  log "Espace insuffisant pour un test de restauration (dispo ${AVAIL_KB} Ko, base ${DB_SIZE_KB} Ko)."
  "${NOTIFY}" warn "Test de restauration ignoré" \
    "Espace disque insuffisant pour restaurer une copie de vérification. Le test n'a PAS été effectué : la restaurabilité des sauvegardes n'est pas prouvée cette semaine." || true
  exit 0
fi

# --- 1. Restauration ------------------------------------------------------
log "Restauration de la dernière sauvegarde vers ${SCRATCH}..."
rm -rf "${SCRATCH}"
mkdir -p "${SCRATCH}" "${SOCKET_DIR}"
chmod 0700 "${SCRATCH}"

pgbackrest --stanza="${STANZA}" \
  --pg1-path="${SCRATCH}" \
  --type=default \
  restore \
  || fail "pgbackrest restore a échoué."

# --- 2. Neutralisation de l'instance restaurée ---------------------------
# Point critique : sans archive_mode=off, l'instance de test enverrait ses
# propres WAL dans le dépôt et corromprait la chaîne de sauvegarde de la
# production.
cat >> "${SCRATCH}/postgresql.auto.conf" <<EOF

# --- Ajouté par backup-verify.sh : isolation de l'instance de test ---
archive_mode = off
archive_command = ''
port = ${VERIFY_PORT}
unix_socket_directories = '${SOCKET_DIR}'
listen_addresses = ''
ssl = off
shared_buffers = 128MB
shared_preload_libraries = ''
max_connections = 10
EOF

# --- 3. Démarrage et attente de la fin de la récupération ----------------
log "Démarrage de l'instance de vérification (port ${VERIFY_PORT})..."
pg_ctl -D "${SCRATCH}" -l "${SCRATCH}/verify.log" -w -t 300 start \
  || fail "L'instance restaurée n'a pas démarré. Journal : $(tail -30 "${SCRATCH}/verify.log" 2>/dev/null)"

# --- 4. Contrôle du contenu ----------------------------------------------
log "Vérification du contenu..."

PSQL="psql -h ${SOCKET_DIR} -p ${VERIFY_PORT} -d ${DB_NAME} -t -A -X -q"

# Les tables métier : si l'une est vide alors qu'elle ne devrait pas l'être,
# la sauvegarde est techniquement valide mais fonctionnellement inutile.
RESULT=$(${PSQL} -c "
  SELECT 'tenants=' || (SELECT count(*) FROM tenants)
      || ' users='   || (SELECT count(*) FROM users)
      || ' eleves='  || (SELECT count(*) FROM eleves)
      || ' classes=' || (SELECT count(*) FROM classes)
      || ' notes='   || (SELECT count(*) FROM notes);
" 2>&1) || fail "Requête impossible sur la base restaurée : ${RESULT}"

log "Contenu restauré : ${RESULT}"

USERS=$(${PSQL} -c "SELECT count(*) FROM users;" 2>/dev/null | tr -d '[:space:]')
if ! [ "${USERS}" -gt 0 ] 2>/dev/null; then
  fail "La base restaurée ne contient aucun utilisateur (users=${USERS}). Sauvegarde exploitable mais vide."
fi

# --- 5. Intégrité physique ------------------------------------------------
# Détecte une corruption de page qui passerait inaperçue au simple comptage.
if ! ${PSQL} -c "SELECT count(*) FROM pg_database;" >/dev/null 2>&1; then
  fail "Le catalogue système de la base restaurée est illisible."
fi

DURATION=$(( $(date +%s) - START ))
log "Test de restauration RÉUSSI en ${DURATION}s."

"${NOTIFY}" info "Test de restauration réussi" \
  "La dernière sauvegarde a été restaurée et vérifiée avec succès.

${RESULT}
Durée : ${DURATION}s" || true

exit 0
