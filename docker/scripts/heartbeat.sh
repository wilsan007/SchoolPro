#!/bin/sh
# ============================================================
# EcolPro — Signal de vie (« dead man's switch »)
#
# LE POINT AVEUGLE QUE CE FICHIER COMBLE
# notify.sh n'alerte qu'en cas d'ÉCHEC. Si l'ordonnanceur Ofelia meurt, si
# le conteneur ne redémarre pas, si le jeton Telegram expire ou si le
# réseau sortant est coupé, il ne se passe… rien. Et rien ressemble
# exactement à « tout va bien ». C'est la panne la plus dangereuse d'un
# système d'alerte : celle du système d'alerte lui-même.
#
# Le principe s'inverse ici : la tâche signale ses SUCCÈS à un service
# externe, qui alerte en cas d'ABSENCE de signal. Le silence devient
# détectable, et l'alerte ne dépend plus du VPS pour partir.
#
# Compatible healthchecks.io (offre gratuite suffisante), Better Stack,
# Cronitor — tout service exposant une URL de ping.
#
# Usage :
#   heartbeat.sh backup          → ping de succès
#   heartbeat.sh backup fail     → signale un échec (alerte immédiate)
#
# La variable attendue est HEARTBEAT_<NOM_EN_MAJUSCULES>_URL. Absente,
# le script sort sans rien faire : le dispositif est optionnel et ne peut
# jamais faire échouer la tâche qu'il observe.
# ============================================================
set -u

NAME="${1:-}"
STATUS="${2:-ok}"
[ -z "${NAME}" ] && exit 0

VAR="HEARTBEAT_$(echo "${NAME}" | tr 'a-z-' 'A-Z_')_URL"
URL=$(eval "printf '%s' \"\${${VAR}:-}\"")
[ -z "${URL}" ] && exit 0

[ "${STATUS}" = "fail" ] && URL="${URL}/fail"

# --max-time : un service de ping injoignable ne doit pas retarder une
# sauvegarde. --retry 2 : une coupure réseau passagère ne doit pas non
# plus déclencher une fausse alerte.
curl -fsS --max-time 15 --retry 2 --retry-delay 3 -o /dev/null "${URL}" \
  && echo "[heartbeat] ${NAME} : signal ${STATUS} envoyé" \
  || echo "[heartbeat] ${NAME} : signal non envoyé (sans conséquence sur la tâche)"

exit 0
