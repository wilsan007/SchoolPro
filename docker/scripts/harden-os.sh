#!/usr/bin/env bash
# ============================================================
# EcolPro — Durcissement du système d'exploitation (Debian/Ubuntu)
#
# À exécuter UNE FOIS sur le VPS, avant le premier déploiement.
# Idempotent : le relancer est sans danger.
#
# Ce que fait le script :
#   1. mises à jour de sécurité automatiques (unattended-upgrades)
#   2. pare-feu UFW : refus par défaut, SSH seul autorisé
#   3. règle du contournement d'UFW par Docker
#   4. durcissement SSH : clés uniquement, pas de root
#   5. fail2ban : bannissement des tentatives de force brute SSH
#   6. paramètres noyau (sysctl) : réseau et mémoire
#   7. journaux persistants (indispensable à toute analyse post-incident)
#   8. installation de Trivy pour l'analyse des images
#
# IMPORTANT — avant de désactiver l'authentification par mot de passe, le
# script VÉRIFIE qu'une clé SSH est bien installée. Sans cela, vous
# risqueriez de vous verrouiller hors du serveur.
#
# Usage :  sudo ./docker/scripts/harden-os.sh [--ssh-port 22]
# ============================================================
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BOLD=$'\033[1m'; NC=$'\033[0m'
log()  { echo "${GREEN}[durcissement]${NC} $*"; }
warn() { echo "${YELLOW}[durcissement]${NC} $*"; }
err()  { echo "${RED}[durcissement]${NC} $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || err "Ce script doit être lancé en root (sudo)."

SSH_PORT=22
while [ $# -gt 0 ]; do
  case "$1" in
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    *) err "Argument inconnu : $1" ;;
  esac
done

export DEBIAN_FRONTEND=noninteractive

# ============================================================
log "1/8 — Mises à jour et paquets de base"
# ============================================================
apt-get update -qq
apt-get install -y -qq \
  unattended-upgrades apt-listchanges \
  ufw fail2ban \
  ca-certificates curl gnupg \
  ss 2>/dev/null || apt-get install -y -qq iproute2

# Les correctifs de sécurité sont appliqués sans intervention. Un serveur
# qu'on met à jour « quand on y pense » finit par ne plus l'être.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Origins-Pattern {
        "origin=Debian,codename=${distro_codename},label=Debian-Security";
        "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
        "origin=Ubuntu,archive=${distro_codename}-security";
};
Unattended-Upgrade::Package-Blacklist {
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
// Pas de redémarrage automatique : un redémarrage non planifié couperait
// l'accès des établissements en pleine journée. L'audit signale quand un
// redémarrage devient nécessaire, à planifier hors heures de classe.
Unattended-Upgrade::Automatic-Reboot "false";
EOF

systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
log "     mises à jour de sécurité automatiques activées"

# ============================================================
log "2/8 — Pare-feu UFW"
# ============================================================
ufw --force reset >/dev/null 2>&1
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null

# SSH est le SEUL port entrant. Pas de 80, pas de 443 : le trafic web arrive
# par le tunnel Cloudflare, qui est une connexion SORTANTE.
ufw limit "${SSH_PORT}/tcp" comment 'SSH (avec limitation de débit)' >/dev/null

ufw --force enable >/dev/null
log "     UFW actif — entrée refusée par défaut, seul le port ${SSH_PORT} (SSH) est ouvert"
warn "     Aucun port 80/443 ouvert : c'est voulu, le tunnel Cloudflare sort du VPS."

# ============================================================
log "3/8 — Empêcher Docker de contourner UFW"
# ============================================================
# Docker écrit ses règles directement dans iptables, en amont d'UFW : un
# `ports:` dans compose exposerait un service sur Internet malgré un UFW
# « actif ». Ce réglage rend le comportement conforme à l'attente.
if ! grep -q 'DOCKER-USER' /etc/ufw/after.rules 2>/dev/null; then
  cat >> /etc/ufw/after.rules <<'EOF'

# --- Ajouté par EcolPro : neutralise le contournement d'UFW par Docker ---
# Sans cette chaîne, tout port publié par un conteneur est joignable depuis
# Internet même si UFW refuse tout en entrée.
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -i lo -j RETURN
# Autorise les réseaux privés (communication entre conteneurs).
-A DOCKER-USER -s 172.16.0.0/12 -j RETURN
-A DOCKER-USER -s 192.168.0.0/16 -j RETURN
-A DOCKER-USER -s 10.0.0.0/8 -j RETURN
# Tout le reste est rejeté : aucun conteneur n'est joignable de l'extérieur.
-A DOCKER-USER -j DROP
COMMIT
EOF
  log "     règle DOCKER-USER ajoutée"
else
  log "     règle DOCKER-USER déjà présente"
fi

# ============================================================
log "4/8 — Durcissement SSH"
# ============================================================
# Contrôle de sécurité : ne jamais couper l'accès par mot de passe si aucune
# clé n'est installée. C'est la première cause de perte d'accès à un VPS.
KEYS_FOUND=0
for home in /root /home/*; do
  [ -f "${home}/.ssh/authorized_keys" ] || continue
  if grep -qE '^(ssh-|ecdsa-|sk-)' "${home}/.ssh/authorized_keys" 2>/dev/null; then
    KEYS_FOUND=$((KEYS_FOUND + 1))
  fi
done

if [ "${KEYS_FOUND}" -eq 0 ]; then
  warn "     AUCUNE clé SSH trouvée dans authorized_keys."
  warn "     L'authentification par mot de passe est CONSERVÉE pour ne pas"
  warn "     vous verrouiller dehors."
  warn "     Installez une clé (ssh-copy-id), puis relancez ce script."
  SSH_HARDEN_PASSWORD=false
else
  log "     ${KEYS_FOUND} jeu(x) de clés SSH détecté(s)"
  SSH_HARDEN_PASSWORD=true
fi

mkdir -p /etc/ssh/sshd_config.d
CONF=/etc/ssh/sshd_config.d/99-ecolpro-hardening.conf

{
  echo "# Généré par EcolPro harden-os.sh — ne pas éditer à la main"
  echo "Port ${SSH_PORT}"
  echo "Protocol 2"
  echo
  echo "# Pas de connexion root directe : on passe par un compte nominatif"
  echo "# puis sudo, ce qui laisse une trace attribuable dans les journaux."
  echo "PermitRootLogin no"
  echo
  if [ "${SSH_HARDEN_PASSWORD}" = true ]; then
    echo "PasswordAuthentication no"
    echo "KbdInteractiveAuthentication no"
    echo "ChallengeResponseAuthentication no"
    echo "PermitEmptyPasswords no"
  else
    echo "# Conservé : aucune clé SSH n'était installée au moment du durcissement."
    echo "PasswordAuthentication yes"
  fi
  echo "PubkeyAuthentication yes"
  echo
  echo "# Coupe les sessions inactives et les connexions qui n'aboutissent pas."
  echo "ClientAliveInterval 300"
  echo "ClientAliveCountMax 2"
  echo "LoginGraceTime 30"
  echo "MaxAuthTries 3"
  echo "MaxSessions 5"
  echo "MaxStartups 10:30:60"
  echo
  echo "# Fonctions inutiles ici : les désactiver réduit la surface d'attaque."
  echo "X11Forwarding no"
  echo "AllowAgentForwarding no"
  echo "AllowTcpForwarding yes   # requis par les tunnels d'administration psql"
  echo "PermitTunnel no"
  echo "GatewayPorts no"
  echo
  echo "# Algorithmes modernes uniquement."
  echo "KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512"
  echo "Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com"
  echo "MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com"
  echo "HostKeyAlgorithms ssh-ed25519,ssh-ed25519-cert-v01@openssh.com,rsa-sha2-512,rsa-sha2-256"
  echo
  echo "LogLevel VERBOSE"
} > "${CONF}"

# On valide la configuration AVANT de recharger : une erreur de syntaxe
# empêcherait sshd de redémarrer, donc tout accès au serveur.
if sshd -t 2>/dev/null; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  log "     configuration SSH appliquée"
else
  rm -f "${CONF}"
  err "Configuration SSH invalide, modifications annulées. Aucun changement appliqué."
fi

# ============================================================
log "5/8 — fail2ban"
# ============================================================
cat > /etc/fail2ban/jail.d/ecolpro.local <<EOF
[DEFAULT]
# 1 h de bannissement, sur la base de 5 échecs en 10 min.
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
# Ne jamais se bannir soi-même depuis la machine.
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled  = true
port     = ${SSH_PORT}
maxretry = 3
# Les récidivistes sont bannis beaucoup plus longtemps.
bantime  = 24h
EOF

systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban >/dev/null 2>&1 || true
log "     fail2ban actif (prison sshd)"

# ============================================================
log "6/8 — Paramètres noyau"
# ============================================================
cat > /etc/sysctl.d/99-ecolpro-hardening.conf <<'EOF'
# --- Réseau : anti-usurpation et anti-inondation ---
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = 0

# --- Limites de connexions (pics de charge en début d'année scolaire) ---
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.ip_local_port_range = 10240 65535

# --- Mémoire : PostgreSQL n'aime pas être trop retardé sur l'écriture ---
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
# overcommit_memory = 2 évite que le tueur de processus (OOM killer) ne
# choisisse PostgreSQL, ce qui provoquerait un arrêt brutal de la base.
vm.overcommit_memory = 2
vm.overcommit_ratio = 90

# --- Durcissement divers ---
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
# Empêche un utilisateur non privilégié d'inspecter les autres processus.
kernel.yama.ptrace_scope = 1
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.suid_dumpable = 0
EOF

sysctl --system >/dev/null 2>&1 || true
log "     paramètres noyau appliqués"

# ============================================================
log "7/8 — Journaux persistants"
# ============================================================
# Par défaut, certains VPS gardent les journaux en mémoire : ils disparaissent
# au redémarrage. Une analyse post-incident devient alors impossible.
mkdir -p /var/log/journal
if ! grep -q '^Storage=persistent' /etc/systemd/journald.conf 2>/dev/null; then
  sed -i 's/^#\?Storage=.*/Storage=persistent/' /etc/systemd/journald.conf
fi
if ! grep -q '^SystemMaxUse=' /etc/systemd/journald.conf 2>/dev/null; then
  echo 'SystemMaxUse=2G' >> /etc/systemd/journald.conf
fi
systemctl restart systemd-journald >/dev/null 2>&1 || true
log "     journaux persistants (2 Go maximum)"

# ============================================================
log "8/8 — Trivy (analyse de vulnérabilités des images)"
# ============================================================
if ! command -v trivy >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://aquasecurity.github.io/trivy-repo/deb/public.key \
    | gpg --dearmor -o /etc/apt/keyrings/trivy.gpg 2>/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
    > /etc/apt/sources.list.d/trivy.list
  apt-get update -qq && apt-get install -y -qq trivy || warn "     installation de Trivy échouée (non bloquant)"
fi
command -v trivy >/dev/null 2>&1 && log "     Trivy installé" || warn "     Trivy absent"

# ============================================================
echo
echo "${BOLD}=============================================="
echo " Durcissement terminé"
echo "==============================================${NC}"
echo
log "Vérifier le résultat :  ./docker/scripts/security-audit.sh"
echo
if [ "${SSH_HARDEN_PASSWORD}" != true ]; then
  warn "À FAIRE : installer une clé SSH puis relancer ce script pour"
  warn "désactiver l'authentification par mot de passe."
fi
if [ -f /var/run/reboot-required ]; then
  warn "Un redémarrage est requis pour appliquer les mises à jour du noyau."
  warn "À planifier hors heures de classe."
fi
