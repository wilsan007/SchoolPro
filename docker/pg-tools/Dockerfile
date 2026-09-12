FROM postgres:16-bookworm

# Ajouter le dépôt PostgreSQL APT (PGDG) pour les extensions
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
        postgresql-server-dev-16 make gcc && \
    install -d /usr/share/postgresql-common/pgdg && \
    curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc && \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && apt-get install -y --no-install-recommends \
        postgresql-16-pgaudit \
        postgresql-16-hypopg \
        postgresql-16-pgtap \
        pgxnclient \
    && rm -rf /var/lib/apt/lists/*

# Installer plpgsql_check via PGXN (non disponible en paquet apt)
RUN pgxn install plpgsql_check
