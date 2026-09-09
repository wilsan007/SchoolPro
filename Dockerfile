# syntax = docker/dockerfile:1

# ── Build stage ──────────────────────────────────────────────
FROM node:22-slim AS builder

# Corepack pour pnpm (version pinnée via packageManager dans package.json)
RUN corepack enable

WORKDIR /app

# Copier les fichiers de dépendances + config pnpm + dépendances locales
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY eslint-rules ./eslint-rules

# Augémenter la limite mémoire du heap Node.js pour le build Next.js
# SKIP_TYPECHECK=true : le type checking est fait localement (pre-commit hook)
# Évite l'OOM sur le builder Depot (2 GB RAM) pendant `tsc` dans `next build`
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV SKIP_TYPECHECK="true"

# Installer les dépendances (frozen-lockfile = reproductible)
RUN pnpm install --frozen-lockfile

# Copier le reste du code
COPY . .

# Générer Prisma + build
RUN pnpm prisma generate

# DATABASE_URL factice nécessaire au build : Next.js instancie PrismaClient
# au build time. La vraie URL est injectée au runtime via les secrets Fly.io.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# --experimental-build-mode compile : compile sans générer les pages statiques
# (évite l'OOM sur le builder Depot 2 GB). Les pages sont rendues au runtime.
RUN pnpm next build --experimental-build-mode compile

# ── Runner stage ─────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# OpenSSL + curl nécessaires au runtime (Prisma + appels cron internes via supercronic)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl curl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# supercronic : ordonnanceur cron pour conteneurs (pas de syslog, pas de fork zombie).
# Permet d'exécuter les tâches planifiées (drainage LEARNOS, alertes, relances, etc.)
# directement dans le conteneur Fly.io, sans dépendre d'un ordonnanceur externe.
ARG SUPERCRONIC_VERSION=v0.2.30
RUN curl -fsSLo /usr/local/bin/supercronic \
    "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" && \
    chmod +x /usr/local/bin/supercronic

# Copier le build standalone (inclut node_modules minimal + server.js)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copier Prisma (schema + client généré)
# Next.js standalone ne trace pas les binaires Prisma dans .pnpm — il faut
# les copier manuellement sinon PrismaClientInitializationError au runtime.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client ./node_modules/@prisma/client

# Crontab + point d'entrée (lance supercronic + serveur Next.js)
COPY crontab.txt ./crontab.txt
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

CMD [ "./docker-entrypoint.sh" ]
