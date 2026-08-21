# Postgres de développement local

Un seul conteneur jetable, sans rapport avec la stack de production
(`docker-compose.yml`, à la racine — 4 rôles, TLS, pgaudit, réseaux
segmentés). Ici : un rôle superutilisateur, un port publié en local, et
c'est tout.

## Démarrage

```bash
pnpm dev:db:up          # démarre le conteneur (docker-compose.dev.yml)
pnpm prisma db push     # crée le schéma complet (114 modèles)
pnpm db:seed            # optionnel — jeu de données de démonstration
pnpm dev                # l'app lit DATABASE_URL depuis .env
```

`.env.example` pointe déjà `DATABASE_URL`/`DIRECT_URL` vers
`127.0.0.1:55432` (pas 5432 — laisse la place à un Postgres d'un autre
projet déjà présent sur la machine).

## Remise à zéro

```bash
pnpm dev:db:reset       # supprime les données et repart d'une base vide
```

## Contexte

Le développement pointait jusqu'au 2026-08-21 sur un projet Supabase
distant, fermé depuis (le mot de passe avait circulé en clair dans
plusieurs scripts du dépôt — voir l'historique du dépôt). Ce dossier lui
succède : le développement quotidien n'a plus besoin de toucher une base
distante, réelle ou non.

Pour développer volontairement contre les vraies données de production
(cas rare, à réserver au diagnostic d'un incident) :
`scripts/dev-tunnel-vps.sh`.
