#!/bin/sh
# ============================================================
# EcolPro — Activation du dépôt de sauvegarde HORS SITE (repo2)
#
# POURQUOI CE FICHIER EXISTE
# Une sauvegarde stockée sur la machine à sauvegarder ne protège de rien :
# ni d'un rançongiciel qui chiffre tout le disque, ni de la perte du VPS,
# ni de la fermeture du compte hébergeur. Pour des données scolaires
# (élèves, parents, finances), le dépôt hors site n'est pas une option.
#
# POURQUOI GÉNÉRER LA CONFIGURATION AU LIEU DE L'ÉCRIRE EN DUR
# pgBackRest refuse de démarrer si un dépôt est déclaré mais injoignable.
# Déclarer repo2 en dur dans pgbackrest.conf casserait donc toutes les
# sauvegardes tant que les identifiants R2 ne sont pas fournis — c'est
# précisément pourquoi le bloc repo2 était resté commenté, et donc jamais
# activé. Ici, le dépôt n'existe que si les identifiants existent :
# l'activation consiste à ajouter des secrets, sans toucher au code ni
# reconstruire l'image.
#
# pgBackRest fusionne automatiquement les fichiers de /etc/pgbackrest/conf.d
# avec /etc/pgbackrest/pgbackrest.conf. Les valeurs SENSIBLES ne sont pas
# écrites ici : elles restent dans l'environnement, que pgBackRest lit
# directement (PGBACKREST_REPO2_S3_KEY, ..._S3_KEY_SECRET,
# ..._CIPHER_PASS). Rien de secret ne touche le disque.
#
# Appelé au début de pg-backup.sh et de backup-verify.sh : la
# configuration se régénère donc à chaque exécution, et survit à un
# redémarrage du conteneur.
# ============================================================
# POSIX strict : ce fichier est SOURCÉ aussi bien par pg-backup.sh (bash)
# que par `docker exec … sh -c` (dash). `set -o pipefail` n'existe pas dans
# dash et ferait échouer l'appel avec un message des plus obscurs.
set -u

CONF_D="/etc/pgbackrest/conf.d"
OFFSITE_CONF="${CONF_D}/10-offsite.conf"

offsite_configured() {
  [ -n "${PGBACKREST_REPO2_S3_ENDPOINT:-}" ] &&
  [ -n "${PGBACKREST_REPO2_S3_BUCKET:-}" ] &&
  [ -n "${PGBACKREST_REPO2_S3_KEY:-}" ] &&
  [ -n "${PGBACKREST_REPO2_S3_KEY_SECRET:-}" ]
}

if ! offsite_configured; then
  # Pas d'identifiants : on retire une éventuelle configuration résiduelle,
  # sans quoi pgBackRest échouerait en tentant d'atteindre un dépôt dont
  # les clés ont été retirées.
  rm -f "${OFFSITE_CONF}"
  return 0 2>/dev/null || exit 0
fi

mkdir -p "${CONF_D}"

# uri-style=path : Cloudflare R2 n'accepte pas les URL de style « host »
# (bucket.compte.r2.cloudflarestorage.com). Avec le style « host » par
# défaut, chaque opération échoue en 403, de façon peu explicite.
cat > "${OFFSITE_CONF}" <<EOF
[global]
repo2-type=s3
repo2-s3-region=${PGBACKREST_REPO2_S3_REGION:-auto}
repo2-s3-uri-style=path
repo2-path=${PGBACKREST_REPO2_PATH:-/ecolpro}
repo2-cipher-type=aes-256-cbc
repo2-retention-full=${PGBACKREST_REPO2_RETENTION_FULL:-8}
repo2-retention-archive-type=full
repo2-retention-archive=${PGBACKREST_REPO2_RETENTION_FULL:-8}
repo2-bundle=y
EOF

chmod 0640 "${OFFSITE_CONF}"
