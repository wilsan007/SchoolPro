# ============================================================
# EcolPro — Image applicative Next.js (production, durcie)
#
# Durcissement :
#   - build multi-stage : aucun outil de build dans l'image finale
#   - utilisateur non-root (uid 10001)
#   - compatible read-only rootfs (tout écrit va dans des tmpfs)
#   - aucun secret dans les couches (tout vient de l'environnement)
#   - tini comme init pour un arrêt propre (SIGTERM propagé)
#
# Les tags sont épinglés à une version précise. Pour passer aux digests
# (immuables), lancer : make pin-digests
# ============================================================

# --- Stage 1 : dépendances ---------------------------------------------------
FROM node:20.18.1-bookworm-slim AS deps

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /app

# openssl : requis par le moteur de requête Prisma
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY eslint-rules ./eslint-rules
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# --- Stage 2 : build --------------------------------------------------------
FROM node:20.18.1-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js inline les NEXT_PUBLIC_* au moment du build : ils doivent donc être
# connus ici. Ce ne sont pas des secrets (ils finissent dans le bundle client).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm prisma generate
RUN pnpm build

# Élague les dépendances de développement : seul le CLI Prisma reste utile au
# runtime (migrate deploy), le reste du runtime vit dans .next/standalone.
RUN pnpm prune --prod

# --- Stage 3 : runtime ------------------------------------------------------
FROM node:20.18.1-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && apt-get clean

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur dédié, uid haut pour éviter toute collision avec l'hôte
RUN groupadd --system --gid 10001 ecolpro \
 && useradd --system --uid 10001 --gid ecolpro --home /app --shell /usr/sbin/nologin ecolpro

# Sortie standalone : serveur Node autonome (~250 Mo au lieu de ~1,5 Go)
COPY --from=builder --chown=root:root /app/.next/standalone ./
COPY --from=builder --chown=root:root /app/.next/static ./.next/static
COPY --from=builder --chown=root:root /app/public ./public

# Prisma : nécessaire pour `migrate deploy` au démarrage
COPY --from=builder --chown=root:root /app/prisma ./prisma
COPY --from=builder --chown=root:root /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=root:root /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=root:root /app/node_modules/.prisma ./node_modules/.prisma

COPY --chown=root:root docker/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
# Déclencheur des tâches planifiées, appelé par Ofelia via `docker exec`.
COPY --chown=root:root docker/scripts/cron-call.js /app/cron-call.js
RUN chmod 0555 /usr/local/bin/entrypoint.sh /app/cron-call.js

# Le code est possédé par root et non inscriptible par l'app : même compromise,
# l'attaquant ne peut pas réécrire l'application. Les répertoires nécessitant
# une écriture sont montés en tmpfs par docker-compose.
RUN mkdir -p /app/.next/cache \
 && chown -R ecolpro:ecolpro /app/.next/cache

USER 10001:10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
