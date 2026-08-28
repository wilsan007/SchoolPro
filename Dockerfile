# ── Build stage ──────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable

WORKDIR /app

# Copier les fichiers de dépendances + config pnpm + dépendances locales
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY eslint-rules ./eslint-rules

# Installer les dépendances
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

# Copier le build standalone (inclut node_modules minimal + server.js)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copier Prisma (schema + client généré déjà dans standalone)
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "server.js"]
