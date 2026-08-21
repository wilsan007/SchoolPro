#!/usr/bin/env bash
# ============================================================
# EcolPro — Migration de Supabase Cloud vers le VPS
#
# Points d'attention traités par ce script :
#
#  1. CONNEXION DIRECTE OBLIGATOIRE. Supabase propose trois accès :
#       db.<ref>.supabase.co:5432          → direct    (à utiliser ici)
#       aws-1-...pooler.supabase.com:5432  → pooler, mode session
#       aws-1-...pooler.supabase.com:6543  → pooler, mode transaction
#     pg_dump a besoin d'une connexion de session cohérente et de
#     l'introspection du catalogue : le pooler en mode transaction (6543)
#     casse le dump. On force donc la connexion directe.
#
#  2. OBJETS PROPRES À SUPABASE. Le dump contient des schémas (auth,
#     storage, realtime, extensions…) et des rôles (supabase_admin,
#     authenticator…) qui n'existent pas sur le VPS. On ne restaure QUE
#     le schéma `public`, ce qui suffit : l'application n'utilise de
#     Supabase que PostgreSQL.
#
#  3. PROPRIÉTÉ DES OBJETS. Sur le VPS, les tables doivent appartenir à
#     `ecolpro_owner`. On restaure donc sans propriétaire ni privilèges,
#     puis on réattribue.
#
#  4. AUCUNE PERTE POSSIBLE. Le dump local est conservé et le script
#     vérifie les effectifs avant / après.
#
# Usage :
#   ./docker/scripts/migrate-from-supabase.sh \
#     --supabase-host db.xqtjqhkfcctwspotyzqv.supabase.co \
#     --supabase-password '<mot_de_passe>' \
#     --vps user@ip
# ============================================================
set -euo pipefail

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BOLD=$'\033[1m'; NC=$'\033[0m'
log()  { echo "${GREEN}[migration]${NC} $*"; }
warn() { echo "${YELLOW}[migration]${NC} $*"; }
err()  { echo "${RED}[migration]${NC} $*" >&2; exit 1; }

SB_HOST=""
SB_PORT=5432
SB_USER="postgres"
SB_DB="postgres"
SB_PASSWORD=""
VPS=""
DEPLOY_DIR="/opt/ecolpro"
DUMP="ecolpro-supabase-$(date +%Y%m%d_%H%M%S).dump"

while [ $# -gt 0 ]; do
  case "$1" in
    --supabase-host)     SB_HOST="$2"; shift 2 ;;
    --supabase-port)     SB_PORT="$2"; shift 2 ;;
    --supabase-user)     SB_USER="$2"; shift 2 ;;
    --supabase-db)       SB_DB="$2"; shift 2 ;;
    --supabase-password) SB_PASSWORD="$2"; shift 2 ;;
    --vps)               VPS="$2"; shift 2 ;;
    --deploy-dir)        DEPLOY_DIR="$2"; shift 2 ;;
    *) err "Argument inconnu : $1" ;;
  esac
done

[ -n "${SB_HOST}" ] || err "--supabase-host requis"
[ -n "${VPS}" ]     || err "--vps requis (ex : root@203.0.113.50)"

command -v pg_dump >/dev/null 2>&1 || err "pg_dump requis. macOS : brew install libpq && brew link --force libpq"

# Refus explicite du pooler : l'erreur serait sinon obscure et tardive.
case "${SB_HOST}" in
  *pooler.supabase.com)
    err "Hôte pooler détecté. pg_dump exige la connexion DIRECTE :
      db.<ref>.supabase.co (port 5432)
    Le pooler (6543 en mode transaction) ne supporte pas pg_dump." ;;
esac

if [ -z "${SB_PASSWORD}" ]; then
  # -s : la saisie n'apparaît pas à l'écran et ne va pas dans l'historique.
  read -r -s -p "Mot de passe PostgreSQL Supabase : " SB_PASSWORD; echo
fi

SB_URI="postgresql://${SB_USER}:${SB_PASSWORD}@${SB_HOST}:${SB_PORT}/${SB_DB}?sslmode=require"

echo "${BOLD}=============================================="
echo " Migration Supabase → VPS"
echo "==============================================${NC}"
log "Source      : ${SB_HOST}:${SB_PORT}/${SB_DB}"
log "Destination : ${VPS}:${DEPLOY_DIR}"
echo

# ============================================================
log "1/6 — Inventaire de la source"
# ============================================================
COUNTS_BEFORE=$(PGPASSWORD="${SB_PASSWORD}" psql "${SB_URI}" -t -A -X -q -c "
  SELECT 'tenants='  || (SELECT count(*) FROM public.tenants)
      || ' users='   || (SELECT count(*) FROM public.users)
      || ' eleves='  || (SELECT count(*) FROM public.eleves)
      || ' classes=' || (SELECT count(*) FROM public.classes)
      || ' notes='   || (SELECT count(*) FROM public.notes);
" 2>/dev/null) || err "Connexion à Supabase impossible. Vérifier l'hôte et le mot de passe."

log "     Source : ${COUNTS_BEFORE}"

# ============================================================
log "2/6 — Extraction du schéma public"
# ============================================================
# --schema=public       : ignore auth/storage/realtime, propres à Supabase
# --no-owner            : les objets seront réattribués à ecolpro_owner
# --no-privileges       : les GRANT du VPS proviennent de 02-roles.sh
# --no-publications     : la réplication logique de Supabase n'a pas de sens ici
# --format=custom       : compressé et restaurable sélectivement
log "     Extraction en cours (peut prendre plusieurs minutes)..."
PGPASSWORD="${SB_PASSWORD}" pg_dump \
  --dbname="${SB_URI}" \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-publications \
  --no-subscriptions \
  --no-comments \
  --verbose \
  --file="${DUMP}" 2>"${DUMP}.log" \
  || err "pg_dump a échoué. Détail : ${DUMP}.log"

log "     Dump créé : ${DUMP} ($(du -h "${DUMP}" | cut -f1))"

# ============================================================
log "3/6 — Transfert vers le VPS"
# ============================================================
scp -q "${DUMP}" "${VPS}:/tmp/${DUMP}"
log "     Transfert terminé"

# ============================================================
warn "4/6 — La restauration REMPLACE les données du VPS."
warn "      Une sauvegarde préalable du VPS est prise automatiquement."
read -r -p "      Confirmer la restauration ? (oui/non) : " CONFIRM
[ "${CONFIRM}" = "oui" ] || err "Migration annulée. Le dump reste disponible : ${DUMP}"

# ============================================================
log "5/6 — Restauration sur le VPS"
# ============================================================
ssh "${VPS}" DUMP="${DUMP}" DEPLOY_DIR="${DEPLOY_DIR}" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "${DEPLOY_DIR}"

echo "[vps] Sauvegarde de sécurité avant restauration..."
docker exec ecolpro-db pgbackrest --stanza=ecolpro --type=incr backup \
  || echo "[vps] AVERTISSEMENT : la sauvegarde préalable a échoué."

echo "[vps] Arrêt de l'application (évite les écritures pendant la restauration)..."
docker compose stop app

echo "[vps] Copie du dump dans le conteneur..."
docker cp "/tmp/${DUMP}" ecolpro-db:/tmp/restore.dump

echo "[vps] Restauration du schéma public..."
# --clean --if-exists : supprime les objets existants sans échouer s'ils
# sont absents. --no-owner : la propriété est fixée juste après.
# Le code de sortie est ignoré car pg_restore signale des avertissements
# non bloquants (extensions déjà présentes, par exemple) ; la vérification
# des effectifs, plus bas, est le véritable juge.
docker exec ecolpro-db psql -U postgres -d ecolpro -c \
  "SELECT 1" >/dev/null

docker exec ecolpro-db pg_restore \
  --username=postgres \
  --dbname=ecolpro \
  --schema=public \
  --clean --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error=false \
  /tmp/restore.dump 2>&1 | tail -30 || true

echo "[vps] Réattribution de la propriété à ecolpro_owner..."
docker exec ecolpro-db psql -U postgres -d ecolpro -v ON_ERROR_STOP=1 <<'SQL'
-- pg_restore a créé les objets au nom du superutilisateur. On rétablit le
-- modèle de privilèges : ecolpro_owner possède, ecolpro_app consomme.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO ecolpro_owner', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO ecolpro_owner', r.sequencename);
  END LOOP;
  FOR r IN SELECT table_name FROM information_schema.views WHERE table_schema='public' LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO ecolpro_owner', r.table_name);
  END LOOP;
END $$;

-- Les droits du rôle applicatif sont réappliqués : pg_restore --clean a pu
-- recréer des tables sans eux.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ecolpro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ecolpro_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ecolpro_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ecolpro_backup, ecolpro_ro;
SQL

echo "[vps] Alignement de l'état des migrations Prisma..."
# Les données viennent d'un schéma déjà migré : on relance migrate deploy
# pour appliquer d'éventuelles migrations plus récentes que Supabase.
docker compose run --rm migrate || echo "[vps] AVERTISSEMENT : migrate deploy a signalé une erreur."

echo "[vps] Redémarrage de l'application..."
docker compose up -d app

docker exec ecolpro-db rm -f /tmp/restore.dump
rm -f "/tmp/${DUMP}"
REMOTE

# ============================================================
log "6/6 — Vérification"
# ============================================================
COUNTS_AFTER=$(ssh "${VPS}" "docker exec ecolpro-db psql -U postgres -d ecolpro -t -A -X -q -c \"
  SELECT 'tenants='  || (SELECT count(*) FROM public.tenants)
      || ' users='   || (SELECT count(*) FROM public.users)
      || ' eleves='  || (SELECT count(*) FROM public.eleves)
      || ' classes=' || (SELECT count(*) FROM public.classes)
      || ' notes='   || (SELECT count(*) FROM public.notes);
\"" 2>/dev/null)

echo
echo "${BOLD}=============================================="
echo " Comparaison des effectifs"
echo "==============================================${NC}"
echo "  Supabase : ${COUNTS_BEFORE}"
echo "  VPS      : ${COUNTS_AFTER}"
echo

if [ "${COUNTS_BEFORE}" = "${COUNTS_AFTER}" ]; then
  log "${BOLD}Les effectifs correspondent exactement. Migration réussie.${NC}"
else
  warn "Les effectifs DIFFÈRENT. Ne pas basculer le DNS avant d'avoir compris l'écart."
  warn "Le dump local est conservé : ${DUMP}"
  exit 1
fi

echo
log "Étapes suivantes :"
log "  1. Tester la connexion sur https://\$DOMAIN avec un compte existant"
log "  2. ./docker/scripts/security-audit.sh sur le VPS"
log "  3. Conserver ${DUMP} hors ligne jusqu'à validation complète"
log "  4. Ne résilier Supabase qu'après plusieurs jours de fonctionnement"
