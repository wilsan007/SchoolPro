#!/bin/sh
# ============================================================
# EcolPro — Notification Telegram
#
# Utilisé par les tâches planifiées (sauvegarde, audit de sécurité, test
# de restauration) pour alerter immédiatement en cas d'échec.
#
# Pourquoi Telegram ? Le projet possède déjà TELEGRAM_BOT_TOKEN pour les
# notifications aux parents : aucun service supplémentaire, aucun coût, et
# une alerte reçue en quelques secondes sur le téléphone. Un courriel peut
# tomber en indésirable ; c'est inacceptable pour une alerte de sauvegarde.
#
# Usage :
#   notify.sh <niveau> <titre> <message>
#   niveau ∈ info | warn | error
#
# Ne renvoie jamais d'erreur bloquante : une notification qui échoue ne doit
# pas faire échouer la tâche qu'elle rapporte.
# ============================================================

LEVEL="${1:-info}"
TITLE="${2:-EcolPro}"
MESSAGE="${3:-}"

[ -z "${TELEGRAM_BOT_TOKEN:-}" ] && exit 0
[ -z "${TELEGRAM_ALERT_CHAT_ID:-}" ] && exit 0

case "$LEVEL" in
  error) PREFIX="[ALERTE]" ;;
  warn)  PREFIX="[AVERTISSEMENT]" ;;
  *)     PREFIX="[INFO]" ;;
esac

HOST="${VPS_HOSTNAME:-$(hostname)}"
STAMP="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"

TEXT="${PREFIX} ${TITLE}

${MESSAGE}

Hôte : ${HOST}
Date : ${STAMP}"

curl -sS --max-time 15 \
  -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_ALERT_CHAT_ID}" \
  --data-urlencode "text=${TEXT}" \
  --data-urlencode "disable_web_page_preview=true" \
  >/dev/null 2>&1 || true

exit 0
