#!/bin/sh
# SchoolPro / LEARNOS — Point d'entrée Fly.io
# =============================================
# Lance supercronic (tâches planifiées) en arrière-plan, puis le serveur
# Next.js au premier plan. Si le serveur meurt, le conteneur meurt — Fly.io
# le redémarre. Si supercronic meurt, il est relancé par la boucle.

set -eu

# supercronic : ordonnanceur cron pour conteneurs (pas de syslog, pas de fork zombie).
# Téléchargé au build pour reproductibilité.
SUPERCRONIC="/usr/local/bin/supercronic"

if [ -x "$SUPERCRONIC" ]; then
  echo "[entrypoint] démarrage de supercronic avec crontab.txt"
  "$SUPERCRONIC" /app/crontab.txt &
else
  echo "[entrypoint] supercronic non trouvé — tâches planifiées désactivées"
fi

# Serveur Next.js (standalone) au premier plan.
exec node server.js
