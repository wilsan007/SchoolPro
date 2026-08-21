#!/usr/bin/env bash
# ============================================================
# EcolPro — Gestion des secrets (SOPS + age)
#
# Sous-commandes :
#   init      génère la clé age, crée secrets/production.env chiffré
#   edit      ouvre les secrets déchiffrés dans $EDITOR, rechiffre en sortant
#   view      affiche les secrets en clair (attention à l'historique du shell)
#   decrypt   écrit un .env temporaire pour le déploiement (mode 600)
#   rotate    régénère tous les mots de passe internes
#   check     vérifie qu'aucun secret n'est faible, vide ou par défaut
#
# Ce script ne laisse jamais de secret en clair sur le disque, sauf pendant
# `decrypt` (fichier en 0600, supprimé par le script de déploiement).
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRETS_FILE="${REPO_ROOT}/secrets/production.env"
SOPS_CONFIG="${REPO_ROOT}/.sops.yaml"
AGE_KEY_FILE="${HOME}/.config/sops/age/keys.txt"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'
log()  { echo "${GREEN}[secrets]${NC} $*"; }
warn() { echo "${YELLOW}[secrets]${NC} $*"; }
err()  { echo "${RED}[secrets]${NC} $*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || err "$1 est requis. Installation : ${2}"; }

check_tools() {
  need sops "brew install sops  (ou https://github.com/getsops/sops/releases)"
  need age  "brew install age   (ou https://github.com/FiloSottile/age/releases)"
}

gen_pass() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40; }
gen_hex()  { LC_ALL=C tr -dc 'a-f0-9'   </dev/urandom | head -c 64; }
gen_b64()  { openssl rand -base64 32 | tr -d '\n='; }

# ============================================================
# init
# ============================================================
cmd_init() {
  check_tools

  # --- Clé age ---
  if [ -f "${AGE_KEY_FILE}" ]; then
    warn "Une clé age existe déjà : ${AGE_KEY_FILE}"
  else
    log "Génération de la clé age..."
    mkdir -p "$(dirname "${AGE_KEY_FILE}")"
    age-keygen -o "${AGE_KEY_FILE}" 2>/dev/null
    chmod 600 "${AGE_KEY_FILE}"
    log "Clé créée : ${AGE_KEY_FILE}"
  fi

  PUBKEY=$(grep -o 'age1[a-z0-9]*' "${AGE_KEY_FILE}" | head -1)
  [ -z "${PUBKEY}" ] && err "Clé publique age introuvable dans ${AGE_KEY_FILE}"
  log "Clé publique : ${PUBKEY}"

  # --- .sops.yaml ---
  if grep -q "REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_AGE" "${SOPS_CONFIG}"; then
    log "Inscription de la clé publique dans .sops.yaml..."
    # BSD sed (macOS) et GNU sed diffèrent sur -i : on passe par un fichier temporaire.
    tmp=$(mktemp)
    sed "s|REMPLACER_PAR_VOTRE_CLE_PUBLIQUE_AGE|${PUBKEY}|g" "${SOPS_CONFIG}" > "${tmp}"
    mv "${tmp}" "${SOPS_CONFIG}"
  fi

  # --- Fichier de secrets ---
  if [ -f "${SECRETS_FILE}" ]; then
    err "${SECRETS_FILE} existe déjà. Utilisez « make secrets-edit »."
  fi

  log "Génération des secrets internes..."
  mkdir -p "$(dirname "${SECRETS_FILE}")"

  plain=$(mktemp)
  # Le fichier temporaire ne doit jamais être lisible par un autre compte.
  chmod 600 "${plain}"
  trap 'rm -f "${plain}"' EXIT

  cat > "${plain}" <<EOF
# ============================================================
# EcolPro — Secrets de production
#
# Chiffré par SOPS/age. NE JAMAIS déchiffrer vers un fichier suivi par git.
# Édition : make secrets-edit
# ============================================================

# --- Domaine ------------------------------------------------------------
DOMAIN=ecolpro.com
NEXT_PUBLIC_APP_URL=https://ecolpro.com
NEXT_PUBLIC_APP_NAME=EcolPro

# --- PostgreSQL : un mot de passe par rôle -----------------------------
# Générés aléatoirement (40 caractères). Ils ne sont jamais saisis à la main
# et n'ont pas besoin d'être mémorisés.
PG_SUPERUSER_PASSWORD=$(gen_pass)
PG_OWNER_PASSWORD=$(gen_pass)
PG_APP_PASSWORD=$(gen_pass)
PG_BACKUP_PASSWORD=$(gen_pass)
PG_RO_PASSWORD=$(gen_pass)
POSTGRES_DB=ecolpro

# --- PgBouncer ----------------------------------------------------------
PGBOUNCER_ADMIN_PASSWORD=$(gen_pass)

# --- pgBackRest ---------------------------------------------------------
# Chiffre le dépôt de sauvegarde. ATTENTION : perdre cette phrase secrète
# rend TOUTES les sauvegardes irrécupérables. Elle est protégée par SOPS,
# donc sauvegardée avec ce dépôt — c'est le but.
PGBACKREST_CIPHER_PASS=$(gen_b64)

# --- Authentification applicative --------------------------------------
AUTH_SECRET=$(gen_b64)

# --- Tâches planifiées --------------------------------------------------
CRON_SECRET=$(gen_hex)
WEBHOOK_SMS_SECRET=$(gen_hex)

# --- Cloudflare Tunnel --------------------------------------------------
# À récupérer dans le tableau de bord Zero Trust après création du tunnel :
#   Networks → Tunnels → Create a tunnel → Docker → copier la valeur
#   passée à « --token ».
CLOUDFLARE_TUNNEL_TOKEN=

# --- Alertes Telegram ---------------------------------------------------
# Réutilise le bot du projet. TELEGRAM_ALERT_CHAT_ID est VOTRE chat privé,
# pas celui des parents : c'est là qu'arrivent les alertes techniques.
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALERT_CHAT_ID=

# --- Sauvegarde hors site (Cloudflare R2) — fortement recommandé -------
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
PGBACKREST_R2_BUCKET=ecolpro-backups

# --- Courriel (Resend) --------------------------------------------------
RESEND_API_KEY=
EMAIL_FROM=EcolPro <noreply@ecolpro.com>

# --- Paiements (Stripe) -------------------------------------------------
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# --- SMS et messagerie --------------------------------------------------
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
AT_API_KEY=
AT_USERNAME=
AT_SENDER_ID=EcolPro
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=$(gen_hex)
FCM_SERVICE_ACCOUNT=

# --- IA (LEARNOS) -------------------------------------------------------
GLM_API_KEY=
GLM_API_BASE_URL=https://openrouter.ai/api/v1
GLM_MODEL=
OLLAMA_BASE_URL=
OLLAMA_MODEL=gemma2:2b
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
GROQ_API_BASE_URL=https://api.groq.com/openai/v1
EOF

  log "Chiffrement..."
  sops --config "${SOPS_CONFIG}" --encrypt "${plain}" > "${SECRETS_FILE}"
  rm -f "${plain}"
  trap - EXIT

  log "Secrets chiffrés dans ${SECRETS_FILE}"
  echo
  warn "ÉTAPES RESTANTES OBLIGATOIRES :"
  warn "  1. Sauvegardez ${AGE_KEY_FILE} hors ligne (gestionnaire de mots de"
  warn "     passe ou support chiffré). Sans cette clé, les secrets sont perdus."
  warn "  2. make secrets-edit → renseigner CLOUDFLARE_TUNNEL_TOKEN et"
  warn "     TELEGRAM_ALERT_CHAT_ID (sans eux, ni accès ni alertes)."
  warn "  3. git add .sops.yaml secrets/production.env && git commit"
}

# ============================================================
# edit / view
# ============================================================
cmd_edit() {
  check_tools
  [ -f "${SECRETS_FILE}" ] || err "${SECRETS_FILE} absent. Lancez « make secrets-init »."
  sops --config "${SOPS_CONFIG}" "${SECRETS_FILE}"
  log "Secrets rechiffrés."
}

cmd_view() {
  check_tools
  [ -f "${SECRETS_FILE}" ] || err "${SECRETS_FILE} absent."
  sops --config "${SOPS_CONFIG}" --decrypt "${SECRETS_FILE}"
}

# ============================================================
# decrypt — pour le déploiement
# ============================================================
cmd_decrypt() {
  check_tools
  out="${1:?chemin de sortie requis}"
  [ -f "${SECRETS_FILE}" ] || err "${SECRETS_FILE} absent."

  # Le fichier est créé en 0600 AVANT d'y écrire quoi que ce soit : à aucun
  # moment il n'existe avec des permissions ouvertes.
  ( umask 077; : > "${out}" )
  sops --config "${SOPS_CONFIG}" --decrypt "${SECRETS_FILE}" >> "${out}"
  chmod 600 "${out}"
}

# ============================================================
# rotate — régénère les mots de passe internes
# ============================================================
cmd_rotate() {
  check_tools
  [ -f "${SECRETS_FILE}" ] || err "${SECRETS_FILE} absent."

  warn "La rotation change les mots de passe PostgreSQL et PgBouncer."
  warn "AUTH_SECRET n'est PAS touché : le modifier déconnecterait tout le monde."
  warn "PGBACKREST_CIPHER_PASS n'est PAS touché : le modifier rendrait les"
  warn "sauvegardes existantes illisibles."
  echo
  read -r -p "Continuer ? (oui/non) : " confirm
  [ "${confirm}" = "oui" ] || err "Rotation annulée."

  plain=$(mktemp); chmod 600 "${plain}"
  trap 'rm -f "${plain}"' EXIT
  sops --config "${SOPS_CONFIG}" --decrypt "${SECRETS_FILE}" > "${plain}"

  for var in PG_SUPERUSER_PASSWORD PG_OWNER_PASSWORD PG_APP_PASSWORD \
             PG_BACKUP_PASSWORD PG_RO_PASSWORD PGBOUNCER_ADMIN_PASSWORD; do
    newval=$(gen_pass)
    tmp=$(mktemp); chmod 600 "${tmp}"
    sed "s|^${var}=.*|${var}=${newval}|" "${plain}" > "${tmp}"
    mv "${tmp}" "${plain}"
    log "  ${var} régénéré"
  done

  sops --config "${SOPS_CONFIG}" --encrypt "${plain}" > "${SECRETS_FILE}"
  rm -f "${plain}"; trap - EXIT

  log "Rotation effectuée."
  echo
  warn "Les mots de passe sont changés dans les SECRETS, pas encore dans"
  warn "PostgreSQL. Appliquez-les avec :  make secrets-apply"
}

# ============================================================
# check — détecte les secrets faibles ou manquants
# ============================================================
cmd_check() {
  check_tools
  [ -f "${SECRETS_FILE}" ] || err "${SECRETS_FILE} absent."

  plain=$(mktemp); chmod 600 "${plain}"
  trap 'rm -f "${plain}"' EXIT
  sops --config "${SOPS_CONFIG}" --decrypt "${SECRETS_FILE}" > "${plain}"

  problems=0

  # Variables sans lesquelles le déploiement ne peut pas fonctionner.
  for var in DOMAIN NEXT_PUBLIC_APP_URL PG_SUPERUSER_PASSWORD \
             PG_OWNER_PASSWORD PG_APP_PASSWORD PG_BACKUP_PASSWORD \
             PG_RO_PASSWORD PGBOUNCER_ADMIN_PASSWORD PGBACKREST_CIPHER_PASS \
             AUTH_SECRET CRON_SECRET CLOUDFLARE_TUNNEL_TOKEN; do
    val=$(grep "^${var}=" "${plain}" | head -1 | cut -d= -f2-)
    if [ -z "${val}" ]; then
      echo "${RED}[!]${NC} ${var} est vide (obligatoire)"
      problems=$((problems + 1))
    fi
  done

  # Longueur minimale des secrets cryptographiques.
  for var in AUTH_SECRET CRON_SECRET PGBACKREST_CIPHER_PASS; do
    val=$(grep "^${var}=" "${plain}" | head -1 | cut -d= -f2-)
    if [ -n "${val}" ] && [ "${#val}" -lt 32 ]; then
      echo "${RED}[!]${NC} ${var} fait ${#val} caractères (minimum 32)"
      problems=$((problems + 1))
    fi
  done

  for var in PG_SUPERUSER_PASSWORD PG_OWNER_PASSWORD PG_APP_PASSWORD \
             PG_BACKUP_PASSWORD PG_RO_PASSWORD PGBOUNCER_ADMIN_PASSWORD; do
    val=$(grep "^${var}=" "${plain}" | head -1 | cut -d= -f2-)
    if [ -n "${val}" ] && [ "${#val}" -lt 24 ]; then
      echo "${RED}[!]${NC} ${var} fait ${#val} caractères (minimum 24)"
      problems=$((problems + 1))
    fi
  done

  # Mots de passe identiques : annulerait la séparation des rôles.
  dupes=$(grep -E '^(PG_|PGBOUNCER_)[A-Z_]*PASSWORD=' "${plain}" \
    | cut -d= -f2- | sort | uniq -d | grep -c . || true)
  if [ "${dupes}" -gt 0 ]; then
    echo "${RED}[!]${NC} des rôles PostgreSQL partagent le même mot de passe"
    problems=$((problems + 1))
  fi

  # Valeurs manifestement de test.
  if grep -qiE '=(changeme|password|secret|test|123|admin)$' "${plain}"; then
    echo "${RED}[!]${NC} des valeurs de test subsistent"
    problems=$((problems + 1))
  fi

  # Sauvegarde hors site.
  if [ -z "$(grep '^R2_ACCESS_KEY_ID=' "${plain}" | cut -d= -f2-)" ]; then
    echo "${YELLOW}[~]${NC} aucune sauvegarde hors site (R2) : la perte du VPS ferait perdre les sauvegardes"
  fi

  # Alertes.
  if [ -z "$(grep '^TELEGRAM_ALERT_CHAT_ID=' "${plain}" | cut -d= -f2-)" ]; then
    echo "${YELLOW}[~]${NC} TELEGRAM_ALERT_CHAT_ID vide : aucune alerte ne vous parviendra"
  fi

  rm -f "${plain}"; trap - EXIT

  if [ "${problems}" -gt 0 ]; then
    err "${problems} problème(s) bloquant(s) dans les secrets."
  fi
  log "Secrets conformes."
}

# ============================================================
case "${1:-}" in
  init)    cmd_init ;;
  edit)    cmd_edit ;;
  view)    cmd_view ;;
  decrypt) shift; cmd_decrypt "$@" ;;
  rotate)  cmd_rotate ;;
  check)   cmd_check ;;
  *) cat <<USAGE
Usage : $(basename "$0") <commande>

  init      génère la clé age et le fichier de secrets chiffré
  edit      édite les secrets (déchiffrement en mémoire)
  view      affiche les secrets en clair
  decrypt <fichier>  déchiffre vers un fichier en 0600 (déploiement)
  rotate    régénère les mots de passe internes
  check     vérifie complétude et robustesse des secrets
USAGE
     exit 1 ;;
esac
