#!/bin/bash
# ============================================================
# EcolPro — Entrypoint PgBouncer
#
# Prépare, dans un tmpfs (donc en mémoire, jamais sur le disque du VPS) :
#   - pgbouncer.ini (recopié depuis le modèle en lecture seule de l'image)
#   - userlist.txt  (identifiants, absents de l'image)
#   - le certificat TLS interne
#
# Les mots de passe arrivent par l'environnement, déchiffrés par SOPS au
# moment du déploiement.
# ============================================================
set -euo pipefail

: "${PG_APP_PASSWORD:?PG_APP_PASSWORD requis}"
: "${PG_OWNER_PASSWORD:?PG_OWNER_PASSWORD requis}"
: "${PG_RO_PASSWORD:?PG_RO_PASSWORD requis}"
: "${PGBOUNCER_ADMIN_PASSWORD:?PGBOUNCER_ADMIN_PASSWORD requis}"

CONF_DIR="/etc/pgbouncer"
TLS_DIR="${CONF_DIR}/tls"

umask 077
mkdir -p "${TLS_DIR}"

# --- 1. Configuration ------------------------------------------------------
cp /opt/pgbouncer/pgbouncer.ini "${CONF_DIR}/pgbouncer.ini"
chmod 0600 "${CONF_DIR}/pgbouncer.ini"

# --- 2. userlist.txt -------------------------------------------------------
# PgBouncer accepte des mots de passe en clair dans ce fichier et calcule
# lui-même le vérificateur SCRAM à la volée. C'est ce qui permet d'avoir
# `auth_type = scram-sha-256` sans pré-calculer les hachages.
echo "[pgbouncer] Génération de userlist.txt..."
cat > "${CONF_DIR}/userlist.txt" <<EOF
"ecolpro_app" "${PG_APP_PASSWORD}"
"ecolpro_owner" "${PG_OWNER_PASSWORD}"
"ecolpro_ro" "${PG_RO_PASSWORD}"
"pgbouncer_admin" "${PGBOUNCER_ADMIN_PASSWORD}"
EOF
chmod 0600 "${CONF_DIR}/userlist.txt"

# --- 3. Certificat TLS ----------------------------------------------------
if [ ! -f "${TLS_DIR}/server.crt" ]; then
  echo "[pgbouncer] Génération du certificat TLS interne..."
  openssl req -new -x509 -days 3650 -nodes \
    -out "${TLS_DIR}/server.crt" \
    -keyout "${TLS_DIR}/server.key" \
    -subj "/CN=ecolpro-pgbouncer" \
    -addext "subjectAltName=DNS:pgbouncer,DNS:localhost" 2>/dev/null
  chmod 0600 "${TLS_DIR}/server.key"
  chmod 0644 "${TLS_DIR}/server.crt"
fi

# --- 4. Attente de PostgreSQL --------------------------------------------
echo "[pgbouncer] Attente de PostgreSQL (db:5432)..."
for i in $(seq 1 90); do
  if pg_isready -h db -p 5432 -q 2>/dev/null; then
    echo "[pgbouncer] PostgreSQL est prêt."
    break
  fi
  [ "$i" -eq 90 ] && { echo "[pgbouncer] PostgreSQL injoignable après 90 s." >&2; exit 1; }
  sleep 1
done

echo "[pgbouncer] Démarrage sur le port 6432 (mode transaction)..."
exec pgbouncer "${CONF_DIR}/pgbouncer.ini"
