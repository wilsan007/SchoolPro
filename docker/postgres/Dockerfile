# ============================================================
# EcolPro — PostgreSQL 17 durci
#
# Ajouts par rapport à l'image officielle :
#   - pgaudit     : journal d'audit des requêtes (traçabilité forensique)
#   - pgBackRest  : sauvegardes incrémentales + PITR (Point-In-Time Recovery)
#
# On part de bookworm (et non alpine) car pgaudit et pgBackRest sont
# empaquetés par le dépôt officiel PGDG : pas de compilation à la main,
# donc des mises à jour de sécurité livrées par Debian/PGDG.
# ============================================================
FROM postgres:17.2-bookworm

ARG PGAUDIT_VERSION=17

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      postgresql-${PGAUDIT_VERSION}-pgaudit \
      pgbackrest \
      curl \
      ca-certificates \
      tzdata; \
    rm -rf /var/lib/apt/lists/*

# Aucun ordonnanceur n'est embarqué ici : les sauvegardes sont déclenchées
# par Ofelia, qui exécute pg-backup.sh dans ce conteneur via un mandataire
# du socket Docker restreint aux seules opérations `exec`. Un ordonnanceur
# de moins dans l'image, c'est une surface d'attaque de moins.

# Répertoires pgBackRest (le volume est monté par docker-compose)
RUN set -eux; \
    mkdir -p /var/lib/pgbackrest /var/log/pgbackrest /etc/pgbackrest; \
    chown -R postgres:postgres /var/lib/pgbackrest /var/log/pgbackrest /etc/pgbackrest; \
    chmod 0750 /var/lib/pgbackrest /var/log/pgbackrest

COPY --chown=postgres:postgres docker/pgbackrest/pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
COPY --chown=root:root docker/scripts/pg-backup.sh /usr/local/bin/pg-backup.sh
COPY --chown=root:root docker/scripts/backup-verify.sh /usr/local/bin/backup-verify.sh
COPY --chown=root:root docker/scripts/security-audit-db.sh /usr/local/bin/security-audit-db.sh
COPY --chown=root:root docker/scripts/notify.sh /usr/local/bin/notify.sh
RUN chmod 0555 \
      /usr/local/bin/pg-backup.sh \
      /usr/local/bin/backup-verify.sh \
      /usr/local/bin/security-audit-db.sh \
      /usr/local/bin/notify.sh \
 && chmod 0640 /etc/pgbackrest/pgbackrest.conf
