#!/usr/bin/env bash
# ============================================================
# EcolPro — Audit de sécurité de l'hôte
#
# C'est le livrable central de ce dispositif : vous êtes seul responsable
# de la sécurité, donc elle doit être VÉRIFIABLE en une commande, et non
# reposer sur la mémoire d'une documentation.
#
# Contrôlé ici :
#   A. exposition réseau      ports réellement ouverts
#   B. conteneurs             non-root, rootfs en lecture seule, capacités
#   C. socket Docker          aucun montage direct
#   D. secrets                permissions, absence de copie en clair
#   E. SSH                    pas de root, pas de mot de passe
#   F. pare-feu               UFW actif et restrictif
#   G. fail2ban               actif, prison SSH
#   H. mises à jour           correctifs de sécurité en attente
#   I. vulnérabilités images  Trivy si disponible
#   J. sauvegardes            fraîcheur, dépôt hors site, dernier test
#   K. base de données        délègue à security-audit-db.sh
#
# Sortie : rapport noté. Code de sortie 1 si un contrôle CRITIQUE échoue,
# afin de pouvoir l'enchaîner dans un pipeline ou une tâche planifiée.
#
# Usage :
#   ./docker/scripts/security-audit.sh            (sur le VPS)
#   make audit VPS=user@ip                        (à distance)
# ============================================================
set -uo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'

CRITICAL=0; WARNINGS=0; PASSED=0
FINDINGS=""

section() { echo; echo "${BOLD}${BLUE}── $* ${NC}"; }
ok()   { echo "  ${GREEN}[OK]${NC}    $1"; PASSED=$((PASSED + 1)); }
warn() { echo "  ${YELLOW}[~]${NC}     $1"; FINDINGS="${FINDINGS}[~] $1"$'\n'; WARNINGS=$((WARNINGS + 1)); }
crit() { echo "  ${RED}[!!]${NC}    $1"; FINDINGS="${FINDINGS}[!!] $1"$'\n'; CRITICAL=$((CRITICAL + 1)); }
info() { echo "          $1"; }

has() { command -v "$1" >/dev/null 2>&1; }
# Certains contrôles exigent root. On ne l'impose pas : on signale ce qui
# n'a pas pu être vérifié plutôt que de refuser de tourner.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  has sudo && sudo -n true 2>/dev/null && SUDO="sudo -n"
fi

echo "${BOLD}=============================================="
echo " EcolPro — Audit de sécurité"
echo " Hôte : $(hostname)   $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "==============================================${NC}"

# ============================================================
section "A. Exposition réseau"
# ============================================================
# L'architecture prévoit ZÉRO port applicatif ouvert : le trafic entre par
# un tunnel Cloudflare sortant. Seul SSH doit écouter.
if has ss; then
  LISTEN=$(${SUDO} ss -tlnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -un)
  UNEXPECTED=""
  for p in ${LISTEN}; do
    case "${p}" in
      22) ;;                        # SSH
      53|5353) ;;                   # résolveur local (systemd-resolved)
      323) ;;                       # chrony
      *) UNEXPECTED="${UNEXPECTED} ${p}" ;;
    esac
  done

  if [ -z "${UNEXPECTED}" ]; then
    ok "aucun port inattendu en écoute (seul SSH)"
  else
    crit "ports inattendus en écoute :${UNEXPECTED}"
    info "L'architecture n'exige AUCUN port ouvert hors SSH."
    info "Vérifier :  docker compose ps --format '{{.Names}} {{.Ports}}'"
  fi

  # Le piège classique : un `ports:` dans compose expose sur 0.0.0.0 et
  # perce le pare-feu, car Docker écrit directement dans iptables.
  if has docker; then
    PUBLISHED=$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep -E '0\.0\.0\.0|:::' || true)
    if [ -z "${PUBLISHED}" ]; then
      ok "aucun conteneur ne publie de port sur l'hôte"
    else
      crit "des conteneurs publient des ports (Docker contourne UFW) :"
      echo "${PUBLISHED}" | while IFS= read -r l; do info "${l}"; done
    fi
  fi
else
  warn "ss indisponible : exposition réseau non vérifiée"
fi

# ============================================================
section "B. Durcissement des conteneurs"
# ============================================================
if has docker && docker info >/dev/null 2>&1; then
  RUNNING=$(docker ps --format '{{.Names}}' 2>/dev/null | grep '^ecolpro-' || true)

  if [ -z "${RUNNING}" ]; then
    warn "aucun conteneur ecolpro-* en fonctionnement"
  else
    for c in ${RUNNING}; do
      USER_SPEC=$(docker inspect -f '{{.Config.User}}' "${c}" 2>/dev/null)
      RO=$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "${c}" 2>/dev/null)
      PRIV=$(docker inspect -f '{{.HostConfig.Privileged}}' "${c}" 2>/dev/null)
      NNP=$(docker inspect -f '{{range .HostConfig.SecurityOpt}}{{.}} {{end}}' "${c}" 2>/dev/null)

      [ "${PRIV}" = "true" ] && crit "${c} tourne en mode privilégié"

      case "${NNP}" in
        *no-new-privileges*) ;;
        *) warn "${c} sans no-new-privileges" ;;
      esac

      # PostgreSQL doit écrire dans PGDATA : rootfs inscriptible attendu.
      # Uptime Kuma persiste sa base SQLite : idem.
      case "${c}" in
        ecolpro-db|ecolpro-uptime|ecolpro-socket-proxy)
          [ "${RO}" = "false" ] && ok "${c} rootfs inscriptible (attendu)" ;;
        *)
          if [ "${RO}" = "true" ]; then ok "${c} rootfs en lecture seule"
          else warn "${c} rootfs inscriptible (lecture seule attendue)"; fi ;;
      esac

      # Le compte effectif compte plus que Config.User : une image peut
      # basculer d'utilisateur dans son entrypoint.
      EFF_UID=$(docker exec "${c}" id -u 2>/dev/null || echo "?")
      case "${c}" in
        ecolpro-db)
          # L'entrypoint officiel démarre root puis bascule sur postgres.
          [ "${EFF_UID}" = "0" ] && warn "${c} exécute son processus en root" \
                                 || ok "${c} tourne en uid ${EFF_UID}" ;;
        *)
          if [ "${EFF_UID}" = "0" ]; then crit "${c} tourne en root"
          elif [ "${EFF_UID}" = "?" ]; then info "${c} : uid indéterminé"
          else ok "${c} tourne en uid ${EFF_UID}"; fi ;;
      esac
    done
  fi
else
  warn "Docker inaccessible : durcissement des conteneurs non vérifié"
fi

# ============================================================
section "C. Socket Docker"
# ============================================================
if has docker && docker info >/dev/null 2>&1; then
  # Monter /var/run/docker.sock dans un conteneur équivaut à donner root sur
  # l'hôte. Seul le mandataire restreint doit l'avoir.
  OFFENDERS=""
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    if docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' "${c}" 2>/dev/null \
       | grep -q 'docker.sock'; then
      [ "${c}" = "ecolpro-socket-proxy" ] || OFFENDERS="${OFFENDERS} ${c}"
    fi
  done

  if [ -z "${OFFENDERS}" ]; then
    ok "socket Docker monté uniquement dans le mandataire restreint"
  else
    crit "conteneurs avec accès direct au socket Docker (= root hôte) :${OFFENDERS}"
  fi

  # Le mandataire doit refuser tout ce qui n'est pas `exec`.
  if docker ps --format '{{.Names}}' | grep -q '^ecolpro-socket-proxy$'; then
    for forbidden in VOLUMES NETWORKS IMAGES BUILD SWARM SECRETS; do
      VAL=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' ecolpro-socket-proxy 2>/dev/null \
            | grep "^${forbidden}=" | cut -d= -f2)
      [ "${VAL}" = "1" ] && crit "socket-proxy autorise ${forbidden} (doit être 0)"
    done
    ok "mandataire du socket restreint aux opérations exec"
  fi
fi

# ============================================================
section "D. Secrets"
# ============================================================
DEPLOY_DIR="${DEPLOY_DIR:-/opt/ecolpro}"

# Un .env en clair qui traîne annule l'intérêt du chiffrement SOPS.
LEAKED=$(find "${DEPLOY_DIR}" -maxdepth 2 -name '.env*' -o -maxdepth 2 -name '*.env' 2>/dev/null \
         | grep -v '\.example$' | grep -v 'secrets/production.env' || true)
if [ -z "${LEAKED}" ]; then
  ok "aucun fichier d'environnement en clair dans ${DEPLOY_DIR}"
else
  for f in ${LEAKED}; do
    PERM=$(stat -c '%a' "${f}" 2>/dev/null || stat -f '%Lp' "${f}" 2>/dev/null)
    if [ "${PERM}" = "600" ]; then
      warn "$(basename "${f}") en clair (permissions 600) — à supprimer après déploiement"
    else
      crit "$(basename "${f}") en clair avec permissions ${PERM} (attendu 600 ou absent)"
    fi
  done
fi

# Le fichier chiffré doit vraiment l'être : une erreur de manipulation peut
# committer un fichier en clair sous le même nom.
if [ -f "${DEPLOY_DIR}/secrets/production.env" ]; then
  if grep -q 'sops' "${DEPLOY_DIR}/secrets/production.env" 2>/dev/null; then
    ok "secrets/production.env est bien chiffré (SOPS)"
  else
    crit "secrets/production.env n'est PAS chiffré"
  fi
fi

# ============================================================
section "E. Accès SSH"
# ============================================================
SSHD=/etc/ssh/sshd_config
if [ -r "${SSHD}" ]; then
  # La configuration effective peut venir de sshd_config.d/ : on agrège.
  SSHD_ALL=$(cat "${SSHD}" /etc/ssh/sshd_config.d/*.conf 2>/dev/null)

  eff() { echo "${SSHD_ALL}" | grep -iE "^[[:space:]]*$1[[:space:]]" | tail -1 | awk '{print tolower($2)}'; }

  PRL=$(eff PermitRootLogin)
  PA=$(eff PasswordAuthentication)
  KI=$(eff KbdInteractiveAuthentication)

  case "${PRL}" in
    no|prohibit-password) ok "PermitRootLogin = ${PRL}" ;;
    "") crit "PermitRootLogin non défini (défaut permissif selon la distribution)" ;;
    *)  crit "PermitRootLogin = ${PRL} (attendu no)" ;;
  esac

  case "${PA}" in
    no) ok "authentification par mot de passe désactivée" ;;
    *)  crit "PasswordAuthentication = ${PA:-non défini} : force brute possible" ;;
  esac

  [ "${KI}" = "no" ] || warn "KbdInteractiveAuthentication non désactivé"
else
  warn "${SSHD} illisible : configuration SSH non vérifiée (relancer avec sudo)"
fi

# ============================================================
section "F. Pare-feu"
# ============================================================
if has ufw; then
  UFW_STATUS=$(${SUDO} ufw status 2>/dev/null | head -1)
  if echo "${UFW_STATUS}" | grep -qi 'active'; then
    ok "UFW actif"
    DEFAULT_IN=$(${SUDO} ufw status verbose 2>/dev/null | grep -i 'Default:' || true)
    if echo "${DEFAULT_IN}" | grep -qi 'deny (incoming)'; then
      ok "politique par défaut : refus en entrée"
    else
      crit "politique par défaut en entrée non restrictive : ${DEFAULT_IN}"
    fi
  else
    crit "UFW inactif"
  fi
else
  warn "UFW absent : lancer ./docker/scripts/harden-os.sh"
fi

# ============================================================
section "G. fail2ban"
# ============================================================
if has fail2ban-client; then
  if ${SUDO} fail2ban-client status >/dev/null 2>&1; then
    JAILS=$(${SUDO} fail2ban-client status 2>/dev/null | grep 'Jail list' | cut -d: -f2 | tr -d ' ')
    if echo "${JAILS}" | grep -q 'sshd'; then
      BANNED=$(${SUDO} fail2ban-client status sshd 2>/dev/null | grep 'Currently banned' | grep -oE '[0-9]+' | head -1)
      ok "fail2ban actif, prison sshd (${BANNED:-0} IP bannie(s))"
    else
      warn "fail2ban actif mais sans prison sshd"
    fi
  else
    crit "fail2ban installé mais ne répond pas"
  fi
else
  warn "fail2ban absent : lancer ./docker/scripts/harden-os.sh"
fi

# ============================================================
section "H. Mises à jour"
# ============================================================
if has apt-get; then
  SEC_UPDATES=$(${SUDO} apt-get -s upgrade 2>/dev/null | grep -ci '^Inst.*security' || true)
  if [ "${SEC_UPDATES}" = "0" ]; then
    ok "aucun correctif de sécurité en attente"
  elif [ "${SEC_UPDATES}" -le 5 ]; then
    warn "${SEC_UPDATES} correctif(s) de sécurité en attente"
  else
    crit "${SEC_UPDATES} correctifs de sécurité en attente"
  fi

  if [ -f /etc/apt/apt.conf.d/20auto-upgrades ] \
     && grep -q '"1"' /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null; then
    ok "mises à jour automatiques activées"
  else
    crit "mises à jour automatiques désactivées"
  fi

  # Un noyau mis à jour n'est actif qu'après redémarrage.
  [ -f /var/run/reboot-required ] && warn "redémarrage requis (noyau ou bibliothèque mis à jour)"
fi

# ============================================================
section "I. Vulnérabilités des images"
# ============================================================
if has trivy; then
  for img in ecolpro/app:latest ecolpro/postgres:17 ecolpro/caddy:2 ecolpro/pgbouncer:1; do
    docker image inspect "${img}" >/dev/null 2>&1 || continue
    COUNT=$(trivy image --quiet --severity CRITICAL --format json "${img}" 2>/dev/null \
            | grep -o '"Severity":"CRITICAL"' | wc -l | tr -d ' ')
    if [ "${COUNT}" = "0" ]; then
      ok "${img} : aucune vulnérabilité critique"
    else
      crit "${img} : ${COUNT} vulnérabilité(s) critique(s)"
    fi
  done
else
  warn "Trivy absent : vulnérabilités des images non analysées"
  info "Installation : https://trivy.dev/latest/getting-started/installation/"
fi

# ============================================================
section "J. Sauvegardes"
# ============================================================
if has docker && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^ecolpro-db$'; then
  if docker exec ecolpro-db pgbackrest --stanza=ecolpro info >/dev/null 2>&1; then
    LAST_TS=$(docker exec ecolpro-db pgbackrest --stanza=ecolpro info --output=json 2>/dev/null \
              | grep -o '"stop":[0-9]*' | tail -1 | cut -d: -f2)
    if [ -n "${LAST_TS}" ]; then
      AGE_H=$(( ( $(date +%s) - LAST_TS ) / 3600 ))
      if [ "${AGE_H}" -le 26 ]; then ok "sauvegarde la plus récente : il y a ${AGE_H} h"
      elif [ "${AGE_H}" -le 72 ]; then warn "sauvegarde la plus récente : il y a ${AGE_H} h"
      else crit "sauvegarde la plus récente : il y a ${AGE_H} h — les sauvegardes ne tournent plus"; fi
    else
      crit "aucune sauvegarde présente dans le dépôt"
    fi

    if docker exec ecolpro-db pgbackrest --stanza=ecolpro info --output=json 2>/dev/null \
       | grep -q '"repo":2'; then
      ok "dépôt de sauvegarde hors site actif"
    else
      crit "AUCUN dépôt hors site : perdre le VPS = perdre les données ET les sauvegardes"
    fi
  else
    crit "pgBackRest ne répond pas"
  fi
else
  warn "conteneur ecolpro-db absent : sauvegardes non vérifiées"
fi

# ============================================================
section "K. Base de données"
# ============================================================
if has docker && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^ecolpro-db$'; then
  if docker exec ecolpro-db /usr/local/bin/security-audit-db.sh >/tmp/audit-db.out 2>&1; then
    ok "audit base de données : aucun problème critique"
    grep -E '^\s+ALERTE' /tmp/audit-db.out | head -10 | while IFS= read -r l; do
      warn "base : $(echo "${l}" | sed 's/^ *ALERTE *//')"
    done
  else
    crit "audit base de données : problèmes critiques détectés"
    grep -E '^\s+GRAVE' /tmp/audit-db.out | head -10 | while IFS= read -r l; do
      info "${l}"
    done
    info "Détail : docker exec ecolpro-db /usr/local/bin/security-audit-db.sh"
  fi
  rm -f /tmp/audit-db.out
fi

# ============================================================
# Synthèse
# ============================================================
TOTAL=$((PASSED + WARNINGS + CRITICAL))
SCORE=0
[ "${TOTAL}" -gt 0 ] && SCORE=$(( (PASSED * 100) / TOTAL ))

echo
echo "${BOLD}=============================================="
echo " Synthèse"
echo "==============================================${NC}"
echo "  Conformes      : ${GREEN}${PASSED}${NC}"
echo "  Avertissements : ${YELLOW}${WARNINGS}${NC}"
echo "  Critiques      : ${RED}${CRITICAL}${NC}"
echo "  Score          : ${BOLD}${SCORE}/100${NC}"
echo

if [ "${CRITICAL}" -gt 0 ]; then
  echo "${RED}${BOLD}ACTION REQUISE — ${CRITICAL} problème(s) critique(s)${NC}"
  echo "${FINDINGS}" | grep '^\[!!\]' || true
  echo
  # Alerte Telegram si la configuration est disponible sur l'hôte.
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
    "$(dirname "${BASH_SOURCE[0]}")/notify.sh" error \
      "Audit sécurité : ${CRITICAL} critique(s)" \
      "Score ${SCORE}/100

$(echo "${FINDINGS}" | grep '^\[!!\]')" || true
  fi
  exit 1
fi

if [ "${WARNINGS}" -gt 0 ]; then
  echo "${YELLOW}${WARNINGS} point(s) à améliorer :${NC}"
  echo "${FINDINGS}" | grep '^\[~\]' || true
  echo
fi

echo "${GREEN}${BOLD}Aucun problème critique.${NC}"
exit 0
