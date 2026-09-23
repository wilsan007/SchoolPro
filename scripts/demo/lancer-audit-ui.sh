#!/usr/bin/env bash
# Lancement détaché de l'audit UI — évite les aléas d'intégration du terminal
# interactif (nohup lancé au milieu d'une session chargée peut ne pas démarrer).
#
# USAGE : bash scripts/demo/lancer-audit-ui.sh <base> <log> [args...]
set -euo pipefail

BASE="${1:?base requise, ex: https://schoolpro.fly.dev}"
LOG="${2:?chemin du log requis, ex: /tmp/ui-prod.log}"
shift 2

cd "$(dirname "$0")/../.."
rm -f "$LOG"
nohup node scripts/demo/audit-ui-complet.mjs --base "$BASE" "$@" > "$LOG" 2>&1 &
echo "PID=$! LOG=$LOG"