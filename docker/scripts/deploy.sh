#!/usr/bin/env bash
# ============================================================
# EcolPro — Déploiement sur le VPS
#
# Déroulé :
#   1. contrôles préalables (outils, secrets, état du dépôt git)
#   2. déchiffrement des secrets en fichier temporaire 0600
#   3. synchronisation du code vers le VPS
#   4. construction des images
#   5. bascule : migrations puis démarrage
#   6. vérification de santé, et ROLLBACK automatique en cas d'échec
#   7. suppression du fichier de secrets en clair
#
# Le rollback est automatique : si l'application ne répond pas après le
# déploiement, l'image précédente est remise en service. Un déploiement qui
# casse la production un lundi matin doit se réparer seul.
#
# Usage :
#   ./docker/scripts/deploy.sh --vps user@ip [--skip-build] [--no-rollback]
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BOLD=$'\033[1m'; NC=$'\033[0m'
log()  { echo "${GREEN}[deploy]${NC} $*"; }
warn() { echo "${YELLOW}[deploy]${NC} $*"; }
err()  { echo "${RED}[deploy]${NC} $*" >&2; exit 1; }

VPS=""
DEPLOY_DIR="/opt/ecolpro"
SKIP_BUILD=false
ROLLBACK=true

while [ $# -gt 0 ]; do
  case "$1" in
    --vps)         VPS="$2"; shift 2 ;;
    --deploy-dir)  DEPLOY_DIR="$2"; shift 2 ;;
    --skip-build)  SKIP_BUILD=true; shift ;;
    --no-rollback) ROLLBACK=false; shift ;;
    *) err "Argument inconnu : $1" ;;
  esac
done

[ -n "${VPS}" ] || err "--vps requis (ex : root@203.0.113.50)"

ENV_TMP=""
cleanup() {
  # Le fichier de secrets en clair ne doit jamais survivre au script, même
  # si celui-ci échoue ou est interrompu.
  [ -n "${ENV_TMP}" ] && [ -f "${ENV_TMP}" ] && rm -f "${ENV_TMP}"
  ssh "${VPS}" "rm -f ${DEPLOY_DIR}/.env.runtime" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "${BOLD}=============================================="
echo " Déploiement EcolPro"
echo "==============================================${NC}"

# ============================================================
log "1/7 — Contrôles préalables"
# ============================================================
for t in ssh rsync sops; do
  command -v "$t" >/dev/null 2>&1 || err "$t est requis"
done

[ -f secrets/production.env ] || err "secrets/production.env absent. Lancez « make secrets-init »."

# Vérifie complétude et robustesse avant de partir : un déploiement qui
# échoue faute d'un secret vide gaspille une fenêtre de maintenance.
log "     Validation des secrets..."
./docker/scripts/secrets.sh check

# Un dépôt avec des modifications non committées rend le rollback ambigu :
# on ne saurait pas quelle version est réellement en production.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  warn "     Des modifications ne sont pas committées."
  git status --short | head -10
  read -r -p "     Déployer malgré tout ? (oui/non) : " c
  [ "${c}" = "oui" ] || err "Déploiement annulé."
fi

GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "inconnu")
log "     Version déployée : ${GIT_SHA}"

log "     Contrôle du VPS..."
ssh "${VPS}" 'bash -s' <<'REMOTE'
set -e
command -v docker >/dev/null 2>&1 || { echo "Docker absent. Installer : curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 absent"; exit 1; }
AVAIL=$(df -Pk / | awk 'NR==2 {print int($4/1048576)}')
[ "${AVAIL}" -lt 10 ] && { echo "Espace disque insuffisant : ${AVAIL} Go libres (10 Go minimum)"; exit 1; }
echo "  Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1) — ${AVAIL} Go libres"
MEM=$(free -m | awk '/Mem:/ {print $2}')
echo "  Mémoire : ${MEM} Mo"
[ "${MEM}" -lt 3500 ] && echo "  AVERTISSEMENT : moins de 4 Go de RAM, la stack peut être instable."
REMOTE

# ============================================================
log "2/7 — Déchiffrement des secrets"
# ============================================================
ENV_TMP=$(mktemp)
chmod 600 "${ENV_TMP}"
./docker/scripts/secrets.sh decrypt "${ENV_TMP}"

# Les NEXT_PUBLIC_* sont figés dans le bundle au moment du build : ils
# doivent être connus AVANT la construction de l'image.
APP_URL=$(grep '^NEXT_PUBLIC_APP_URL=' "${ENV_TMP}" | cut -d= -f2-)
DOMAIN=$(grep '^DOMAIN=' "${ENV_TMP}" | cut -d= -f2-)
log "     Domaine : ${DOMAIN} — URL : ${APP_URL}"

# ============================================================
log "3/7 — Synchronisation du code"
# ============================================================
ssh "${VPS}" "mkdir -p ${DEPLOY_DIR}"

rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'coverage' \
  --exclude 'test-results' \
  --exclude 'playwright-report' \
  --exclude '.codegraph' --exclude '.gstack' --exclude '.claude' --exclude '.agents' \
  --exclude 'mobile' --exclude 'mobile-app' \
  --exclude '.env' --exclude '.env.local' --exclude '.env.production' \
  --exclude '*.docx' --exclude '*.pdf' \
  --exclude '.DS_Store' --exclude 'tsconfig.tsbuildinfo' \
  --exclude '.vercel' --exclude '.wrangler' --exclude '.open-next' --exclude 'pages-output' \
  ./ "${VPS}:${DEPLOY_DIR}/"

# Les secrets déchiffrés partent séparément, avec des permissions strictes,
# et sont détruits par le trap de sortie.
scp -q "${ENV_TMP}" "${VPS}:${DEPLOY_DIR}/.env.runtime"
ssh "${VPS}" "chmod 600 ${DEPLOY_DIR}/.env.runtime"
log "     Code et secrets transférés"

# ============================================================
log "4/7 — Construction des images"
# ============================================================
if [ "${SKIP_BUILD}" = false ]; then
  ssh "${VPS}" DEPLOY_DIR="${DEPLOY_DIR}" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "${DEPLOY_DIR}"

# Marque l'image en service comme « précédente », pour pouvoir y revenir.
if docker image inspect ecolpro/app:latest >/dev/null 2>&1; then
  docker tag ecolpro/app:latest ecolpro/app:previous
  echo "[vps] Image actuelle étiquetée ecolpro/app:previous (rollback possible)"
fi

echo "[vps] Récupération des images de base..."
docker compose --env-file .env.runtime pull cloudflared socket-proxy ofelia uptime-kuma 2>/dev/null || true

echo "[vps] Construction..."
docker compose --env-file .env.runtime build --pull db pgbouncer caddy app
REMOTE
else
  log "     Ignoré (--skip-build)"
fi

# ============================================================
log "5/7 — Bascule"
# ============================================================
ssh "${VPS}" DEPLOY_DIR="${DEPLOY_DIR}" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "${DEPLOY_DIR}"

echo "[vps] Démarrage de la base et du pool..."
docker compose --env-file .env.runtime up -d db pgbouncer

echo "[vps] Attente de PostgreSQL..."
for i in $(seq 1 60); do
  docker exec ecolpro-db pg_isready -U postgres -q 2>/dev/null && break
  [ "$i" -eq 60 ] && { echo "[vps] PostgreSQL n'est pas prêt."; exit 1; }
  sleep 2
done

# Sauvegarde avant migration : c'est le point de retour si une migration
# de schéma se révèle destructive.
echo "[vps] Sauvegarde avant migration..."
docker exec ecolpro-db pgbackrest --stanza=ecolpro --type=incr backup 2>/dev/null \
  || echo "[vps] (première exécution : pas encore de sauvegarde de référence)"

echo "[vps] Migrations Prisma..."
docker compose --env-file .env.runtime run --rm migrate

echo "[vps] Démarrage de la stack complète..."
docker compose --env-file .env.runtime up -d

echo "[vps] Suppression des images orphelines..."
docker image prune -f >/dev/null 2>&1 || true
REMOTE

# ============================================================
log "6/7 — Vérification de santé"
# ============================================================
HEALTHY=false
for i in $(seq 1 30); do
  # On interroge l'application depuis l'intérieur du conteneur : cela
  # valide l'application indépendamment du tunnel et du DNS.
  if ssh "${VPS}" "docker exec ecolpro-app node -e \"
      fetch('http://127.0.0.1:3000/api/health')
        .then(r => r.json())
        .then(j => process.exit(j.ok ? 0 : 1))
        .catch(() => process.exit(1))
    \"" 2>/dev/null; then
    HEALTHY=true
    break
  fi
  sleep 4
done

if [ "${HEALTHY}" = true ]; then
  log "     Application opérationnelle"
else
  warn "     L'application NE RÉPOND PAS."
  ssh "${VPS}" "docker logs ecolpro-app --tail 40" 2>/dev/null || true

  if [ "${ROLLBACK}" = true ]; then
    warn "     Retour à la version précédente..."
    ssh "${VPS}" DEPLOY_DIR="${DEPLOY_DIR}" 'bash -s' <<'REMOTE'
set -uo pipefail
cd "${DEPLOY_DIR}"
if docker image inspect ecolpro/app:previous >/dev/null 2>&1; then
  docker tag ecolpro/app:previous ecolpro/app:latest
  docker compose --env-file .env.runtime up -d --force-recreate app
  echo "[vps] Version précédente remise en service."
  echo "[vps] ATTENTION : les migrations de schéma NE SONT PAS annulées."
  echo "[vps] Si la panne vient d'une migration, restaurer via le RUNBOOK."
else
  echo "[vps] Aucune image précédente : rollback impossible."
fi
REMOTE
    err "Déploiement échoué, retour arrière effectué. Consultez RUNBOOK.md."
  fi
  err "Déploiement échoué (rollback désactivé)."
fi

# ============================================================
log "7/7 — Contrôle de sécurité"
# ============================================================
ssh "${VPS}" "cd ${DEPLOY_DIR} && ./docker/scripts/security-audit.sh" || \
  warn "     L'audit signale des problèmes — à traiter (voir ci-dessus)."

echo
echo "${BOLD}=============================================="
echo " Déploiement terminé — version ${GIT_SHA}"
echo "==============================================${NC}"
echo
log "État        : ssh ${VPS} 'cd ${DEPLOY_DIR} && docker compose ps'"
log "Journaux    : ssh ${VPS} 'docker logs ecolpro-app -f'"
log "Application : ${APP_URL}"
echo
warn "Si le tunnel Cloudflare n'est pas encore configuré, le site n'est pas"
warn "joignable publiquement. Voir DEPLOYMENT-VPS.md, section « Cloudflare »."
