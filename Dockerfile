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
RUN pnpm build

# ── Runner stage ─────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# OpenSSL nécessaire pour Prisma au runtime
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Copier le build standalone (inclut node_modules minimal + server.js)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copier Prisma (schema + client généré déjà dans standalone)
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD [ "node", "server.js" ]
