# ============================================================
# EcolPro — Caddy avec module de limitation de débit
#
# Le module `caddy-ratelimit` n'est pas inclus dans l'image officielle :
# il faut recompiler Caddy avec xcaddy. C'est la deuxième couche de
# défense contre le bourrage d'identifiants — la première étant les règles
# de limitation de Cloudflare, qui filtrent en périphérie avant même que
# le trafic n'atteigne le VPS.
# ============================================================

FROM caddy:2.9.1-builder AS builder

RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2.9.1-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

COPY docker/caddy/Caddyfile /etc/caddy/Caddyfile

# Vérifie la syntaxe au build : une erreur de configuration fait échouer la
# construction de l'image, pas le déploiement en production.
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:2019/config/ || exit 1
