#!/bin/sh
# ============================================================
# EcolPro — Entrypoint du conteneur applicatif
#
# Deux modes :
#   entrypoint.sh            → attend les dépendances puis démarre Next.js
#   entrypoint.sh migrate    → applique les migrations Prisma puis sort
#
# Les migrations tournent dans un conteneur ÉPHÉMÈRE distinct, avec le rôle
# `ecolpro_owner` (seul habilité au DDL). Le conteneur applicatif de longue
# durée ne reçoit que `ecolpro_app`, sans droit DDL : même compromis, il ne
# peut ni supprimer une table ni modifier le schéma.
# ============================================================
set -eu

log() { echo "[entrypoint] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

# --- Attente d'un service TCP --------------------------------------------
wait_for() {
  host="$1"; port="$2"; label="$3"; attempts="${4:-60}"
  log "Attente de ${label} (${host}:${port})..."
  i=1
  while [ "$i" -le "$attempts" ]; do
    if node -e "
      const net = require('net');
      const s = net.createConnection({host:'${host}', port:${port}});
      s.on('connect', () => { s.destroy(); process.exit(0); });
      s.on('error', () => process.exit(1));
      setTimeout(() => { s.destroy(); process.exit(1); }, 2000);
    " 2>/dev/null; then
      log "${label} est prêt."
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  log "ERREUR : ${label} injoignable après ${attempts} tentatives."
  return 1
}

# --- Mode migration ------------------------------------------------------
if [ "${1:-}" = "migrate" ]; then
  : "${DIRECT_URL:?DIRECT_URL requis pour les migrations}"

  # Les migrations visent PostgreSQL directement, jamais PgBouncer :
  # `migrate deploy` prend un verrou de session (advisory lock) que le mode
  # transaction de PgBouncer ne peut pas maintenir entre deux requêtes.
  wait_for db 5432 "PostgreSQL" 90

  log "Application des migrations Prisma (rôle ecolpro_owner)..."
  node node_modules/prisma/build/index.js migrate deploy
  log "Migrations appliquées."

  # Les tables viennent d'être créées par ecolpro_owner. ALTER DEFAULT
  # PRIVILEGES (voir 02-roles.sh) leur a déjà accordé les droits pour
  # ecolpro_app. On ne refait donc aucun GRANT ici : si cette étape était
  # nécessaire, cela signalerait que les privilèges par défaut sont mal
  # posés, et il faudrait le corriger à la racine.
  exit 0
fi

# --- Mode serveur --------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL requis}"

# L'application passe par PgBouncer, pas par PostgreSQL.
wait_for pgbouncer 6432 "PgBouncer" 90

log "Démarrage de Next.js sur le port ${PORT:-3000}..."
exec node server.js
