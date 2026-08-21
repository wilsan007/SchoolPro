#!/bin/bash
# ============================================================
# EcolPro — Génération du certificat TLS interne PostgreSQL
#
# Exécuté une seule fois, au premier démarrage (initdb).
# Certificat auto-signé : il ne sert qu'à chiffrer le trafic à
# l'intérieur du réseau Docker, pas à authentifier un tiers public.
# ============================================================
set -euo pipefail

TLS_DIR="/var/lib/postgresql/tls"

if [ -f "${TLS_DIR}/server.crt" ]; then
  echo "[tls] Certificat déjà présent, génération ignorée."
  exit 0
fi

echo "[tls] Génération du certificat TLS interne..."
mkdir -p "${TLS_DIR}"

openssl req -new -x509 -days 3650 -nodes \
  -out "${TLS_DIR}/server.crt" \
  -keyout "${TLS_DIR}/server.key" \
  -subj "/CN=ecolpro-db" \
  -addext "subjectAltName=DNS:db,DNS:localhost" 2>/dev/null

# PostgreSQL refuse de démarrer si la clé est lisible par d'autres.
chmod 0600 "${TLS_DIR}/server.key"
chmod 0644 "${TLS_DIR}/server.crt"
chown postgres:postgres "${TLS_DIR}/server.key" "${TLS_DIR}/server.crt"

echo "[tls] Certificat généré dans ${TLS_DIR}."
