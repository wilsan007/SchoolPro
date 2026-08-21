#!/bin/bash
# ============================================================
# EcolPro — Sauvegarde pgBackRest
#
# Exécuté par supercronic à l'intérieur du conteneur PostgreSQL :
#   - complète    le dimanche à 02h00
#   - différentielle les autres jours à 02h00
#   - incrémentale toutes les 6 h
#
# Chaque exécution vérifie que la sauvegarde est réellement exploitable
# (`pgbackrest info` + contrôle de fraîcheur) et alerte sinon. Une
# sauvegarde silencieusement cassée est pire que pas de sauvegarde : elle
# donne une fausse assurance.
#
# Usage : pg-backup.sh <full|diff|incr>
# ============================================================
set -uo pipefail

TYPE="${1:-incr}"
STANZA="ecolpro"
NOTIFY="/usr/local/bin/notify.sh"
HEARTBEAT="/usr/local/bin/heartbeat.sh"

log() { echo "[backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

# --- Dépôt hors site ------------------------------------------------------
# Régénère la configuration de repo2 si — et seulement si — les
# identifiants R2/S3 sont présents dans l'environnement. Voir
# pgbackrest-offsite.sh pour le détail.
# shellcheck source=/dev/null
. /usr/local/bin/pgbackrest-offsite.sh

OFFSITE="no"
[ -f /etc/pgbackrest/conf.d/10-offsite.conf ] && OFFSITE="yes"

# --- Création de la stanza si absente (premier lancement) -----------------
if ! pgbackrest --stanza="${STANZA}" info >/dev/null 2>&1; then
  log "Stanza absente, création..."
  if ! pgbackrest --stanza="${STANZA}" stanza-create; then
    log "ERREUR : création de la stanza impossible."
    "${NOTIFY}" error "Sauvegarde impossible" \
      "La création de la stanza pgBackRest a échoué. Aucune sauvegarde n'existe. Intervention requise." || true
    "${HEARTBEAT}" backup fail || true
    exit 1
  fi
fi

# --- Vérification de la configuration ------------------------------------
# `check` valide l'archivage des WAL ET la capacité à écrire dans le dépôt.
# Si l'archivage est cassé, les WAL s'accumulent et PostgreSQL finira par
# refuser d'écrire : il faut le savoir tout de suite.
if ! pgbackrest --stanza="${STANZA}" check; then
  log "ERREUR : pgbackrest check a échoué."
  "${NOTIFY}" error "Archivage WAL défaillant" \
    "pgbackrest check échoue : l'archivage des WAL ou l'accès au dépôt est cassé. Le PITR n'est plus garanti et les WAL vont s'accumuler." || true
  "${HEARTBEAT}" backup fail || true
  exit 1
fi

# --- Sauvegarde -----------------------------------------------------------
log "Démarrage d'une sauvegarde de type ${TYPE}..."
START=$(date +%s)

if pgbackrest --stanza="${STANZA}" --repo=1 --type="${TYPE}" backup; then
  DURATION=$(( $(date +%s) - START ))
  log "Sauvegarde ${TYPE} terminée en ${DURATION}s (dépôt local)."

  # --- Copie hors site ---------------------------------------------------
  # pgBackRest ne sauvegarde que vers UN dépôt à la fois : sans cet appel
  # explicite, repo2 ne recevrait que les WAL (archivés vers tous les
  # dépôts), jamais les sauvegardes elles-mêmes — un dépôt hors site
  # inutilisable pour restaurer, alors que tous les voyants seraient au vert.
  if [ "${OFFSITE}" = "yes" ]; then
    log "Copie vers le dépôt hors site..."
    OFF_START=$(date +%s)
    if pgbackrest --stanza="${STANZA}" --repo=2 --type="${TYPE}" backup; then
      log "Dépôt hors site à jour en $(( $(date +%s) - OFF_START ))s."
    else
      log "ERREUR : la sauvegarde hors site a échoué."
      "${NOTIFY}" error "Sauvegarde hors site en échec" \
        "La sauvegarde locale a réussi, mais la copie vers le dépôt distant a échoué. Perdre le VPS signifierait perdre les données ET les sauvegardes. Vérifier les identifiants R2 et : docker logs ecolpro-db." || true
    fi
  else
    log "AVERTISSEMENT : aucun dépôt hors site configuré."
  fi

  # On ne notifie pas les succès de routine : une alerte quotidienne qui
  # n'annonce rien finit par être ignorée, et l'alerte utile avec elle.
  # Seules les sauvegardes complètes hebdomadaires sont confirmées.
  if [ "${TYPE}" = "full" ]; then
    SIZE=$(pgbackrest --stanza="${STANZA}" info --output=text 2>/dev/null | grep -m1 'repo1: backup set size' || echo "taille inconnue")
    "${NOTIFY}" info "Sauvegarde complète réussie" \
      "Durée : ${DURATION}s
${SIZE}" || true
  fi
else
  log "ERREUR : la sauvegarde ${TYPE} a échoué."
  "${NOTIFY}" error "Échec de sauvegarde" \
    "La sauvegarde ${TYPE} a échoué. Consulter : docker logs ecolpro-db et /var/log/pgbackrest." || true
  "${HEARTBEAT}" backup fail || true
  exit 1
fi

# --- Contrôle de fraîcheur -----------------------------------------------
# Détecte le cas pernicieux où les sauvegardes « réussissent » mais où la
# plus récente date de plusieurs jours (tâche mal planifiée, horloge
# décalée, conteneur redémarré en boucle).
LAST_TS=$(pgbackrest --stanza="${STANZA}" info --output=json 2>/dev/null \
  | grep -o '"stop":[0-9]*' | tail -1 | cut -d: -f2)

if [ -n "${LAST_TS}" ]; then
  AGE_HOURS=$(( ( $(date +%s) - LAST_TS ) / 3600 ))
  log "Sauvegarde la plus récente : il y a ${AGE_HOURS} h."
  if [ "${AGE_HOURS}" -gt 26 ]; then
    "${NOTIFY}" warn "Sauvegarde ancienne" \
      "La sauvegarde la plus récente a ${AGE_HOURS} h, alors qu'une sauvegarde est attendue chaque jour." || true
  fi
fi

# Signal de vie : c'est l'ABSENCE de ce ping qui déclenchera l'alerte
# externe si les sauvegardes cessent de tourner — panne que le VPS,
# justement, ne peut pas signaler lui-même.
"${HEARTBEAT}" backup || true

log "Terminé."
