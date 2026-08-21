# ============================================================
# EcolPro — PgBouncer (mutualisation des connexions)
#
# Pourquoi PgBouncer ? Prisma ouvre un pool par instance applicative.
# Sans mutualisation, monter à plusieurs réplicas épuise max_connections
# de PostgreSQL (chaque connexion coûte ~10 Mo). PgBouncer en mode
# transaction permet de servir des centaines de clients avec ~25
# connexions serveur réelles : c'est la clé de la scalabilité horizontale.
#
# Image construite depuis le paquet Debian (mises à jour de sécurité
# suivies par Debian) plutôt qu'une image tierce non maintenue.
# ============================================================
FROM debian:bookworm-slim

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      pgbouncer \
      postgresql-client-15 \
      openssl \
      ca-certificates \
      tini; \
    rm -rf /var/lib/apt/lists/*

# UID/GID fixés explicitement : les options tmpfs de docker-compose doivent
# désigner un propriétaire, et se reposer sur l'UID attribué par le paquet
# Debian serait fragile (il peut changer d'une version à l'autre).
RUN set -eux; \
    groupadd --system --gid 10002 pgbouncer2; \
    useradd --system --uid 10002 --gid 10002 --home /nonexistent \
            --shell /usr/sbin/nologin pgbouncer2

# La configuration de référence est déposée hors de /etc/pgbouncer, car ce
# répertoire est monté en tmpfs au démarrage (pour y écrire userlist.txt et
# le certificat TLS sans toucher au disque). L'entrypoint recopie ce modèle
# dans le tmpfs.
RUN mkdir -p /opt/pgbouncer
COPY --chown=root:root docker/pgbouncer/pgbouncer.ini /opt/pgbouncer/pgbouncer.ini
COPY --chown=root:root docker/pgbouncer/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0444 /opt/pgbouncer/pgbouncer.ini \
 && chmod 0555 /usr/local/bin/entrypoint.sh

USER 10002:10002

EXPOSE 6432

# pg_isready effectue un vrai paquet de démarrage PostgreSQL : il valide que
# PgBouncer accepte les connexions, pas seulement que le port est ouvert.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD pg_isready -h 127.0.0.1 -p 6432 -q || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
